// Tests for extension block reading & pass-through semantics.
// Run after `npm run build` (tests exercise the built lib): npm test
const assert = require('assert')
const { parseGIF, decompressFrames } = require('../lib/index.js')

// --- helpers ---------------------------------------------------------------

const str = s => Array.from(s, c => c.charCodeAt(0))

// assembles a GIF89a buffer from raw byte parts
const gif = (...parts) => {
  const bytes = [
    ...str('GIF89a'),
    1, 0, 1, 0, 0x80, 0, 0, // LSD: 1x1, global color table of 2
    0, 0, 0, 255, 255, 255, // GCT: black, white
    ...[].concat(...parts),
    0x3b // trailer
  ]
  return new Uint8Array(bytes).buffer
}

const comment = text => [0x21, 0xfe, text.length, ...str(text), 0]
const application = () => [
  0x21, 0xff, 11, ...str('NETSCAPE2.0'), 3, 1, 0, 0, 0
]
const plainText = () => [
  0x21, 0x01, 12, 0, 0, 0, 0, 1, 0, 1, 0, 8, 8, 0, 0, 3, ...str('txt'), 0
]
const unknownExt = (label, data) => [0x21, label, data.length, ...data, 0]
const gce = () => [0x21, 0xf9, 4, 0, 10, 0, 0, 0]
const image = () => [
  0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, // descriptor: 1x1 at 0,0
  2, 2, 0x44, 0x01, 0 // lzw data
]

const frameTypes = frames =>
  frames.map(f => {
    if (f.image) return 'image'
    if (f.gce) return 'gce'
    if (f.application) return 'application'
    if (f.comment) return 'comment'
    if (f.text) return 'text'
    if (f.extension) return 'extension'
    return 'unknown'
  })

// flattens every block of every frame into a single type sequence,
// preserving parse (file) order
const blockSequence = frames =>
  frames.reduce(
    (acc, f) =>
      acc.concat(
        ['gce', 'application', 'comment', 'extension', 'image', 'text'].filter(
          k => f[k]
        )
      ),
    []
  )

// --- tests -----------------------------------------------------------------

// every extension type is read back, in file order, and nothing after an
// unknown extension is dropped
{
  const parsed = parseGIF(
    gif(
      comment('hello'),
      unknownExt(0xce, [1, 2, 3, 4, 5]),
      application(),
      plainText(),
      comment('world'),
      gce(),
      image()
    )
  )
  assert.deepStrictEqual(blockSequence(parsed.frames), [
    'comment',
    'extension',
    'application',
    'text',
    'comment',
    'gce',
    'image'
  ])
}

// unknown extensions keep their raw label and concatenated sub-block data
{
  const parsed = parseGIF(gif(unknownExt(0xce, [1, 2, 3]), gce(), image()))
  const ext = parsed.frames[0].extension
  assert.deepStrictEqual(Array.from(ext.codes), [0x21, 0xce])
  assert.deepStrictEqual(Array.from(ext.blocks), [1, 2, 3])
}

// unknown extensions spanning multiple sub-blocks are concatenated
{
  const parsed = parseGIF(gif([0x21, 0x99, 3, 1, 2, 3, 2, 4, 5, 0], gce(), image()))
  assert.deepStrictEqual(Array.from(parsed.frames[0].extension.blocks), [
    1, 2, 3, 4, 5
  ])
}

// repeated blocks of the same type each produce their own entry, in order
{
  const parsed = parseGIF(
    gif(comment('one'), comment('two'), comment('three'), gce(), image())
  )
  const comments = parsed.frames.filter(f => f.comment)
  assert.strictEqual(comments.length, 3)
  assert.deepStrictEqual(
    comments.map(f => String.fromCharCode(...f.comment.blocks)),
    ['one', 'two', 'three']
  )
}

// repeated unknown extensions each produce their own entry, in order
{
  const parsed = parseGIF(
    gif(unknownExt(0xce, [1]), unknownExt(0xce, [2]), gce(), image())
  )
  const exts = parsed.frames.filter(f => f.extension)
  assert.strictEqual(exts.length, 2)
  assert.deepStrictEqual(Array.from(exts[0].extension.blocks), [1])
  assert.deepStrictEqual(Array.from(exts[1].extension.blocks), [2])
}

// an unknown extension between the gce and its image stays on the same
// frame, so graphic control information is not detached from the image
{
  const parsed = parseGIF(gif(gce(), unknownExt(0xce, [9]), image()))
  const frame = parsed.frames.find(f => f.image)
  assert.ok(frame.gce, 'gce stays associated with the image')
  assert.ok(frame.extension, 'unknown extension is preserved on the frame')
}

// plain text extensions parse without crashing and keep their data
{
  const parsed = parseGIF(gif(plainText(), gce(), image()))
  const text = parsed.frames[0].text
  assert.strictEqual(text.blockSize, 12)
  assert.strictEqual(text.preData.length, 12)
  assert.strictEqual(String.fromCharCode(...text.blocks), 'txt')
}

// known extension labels are never captured by the generic catch-all
{
  const parsed = parseGIF(
    gif(comment('a'), application(), plainText(), gce(), image())
  )
  assert.ok(!parsed.frames.some(f => f.extension))
}

// existing decode output is unaffected: only image frames decompress,
// extension blocks are simply carried along on the parsed frames
{
  const parsed = parseGIF(
    gif(comment('meta'), unknownExt(0xce, [1, 2]), gce(), image())
  )
  const frames = decompressFrames(parsed, true)
  assert.strictEqual(frames.length, 1)
  assert.strictEqual(frames[0].delay, 100)
  assert.strictEqual(frames[0].dims.width, 1)
  assert.strictEqual(frames[0].patch.length, 4)
}

console.log('all extension block tests passed')
