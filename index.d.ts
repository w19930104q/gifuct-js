type Application = {
  application: {
    blockSize: number
    blocks: number[]
    codes: number[]
    id: string
  }
}

type Comment = {
  comment: {
    codes: number[]
    blocks: number[]
  }
}

type PlainText = {
  text: {
    codes: number[]
    blockSize: number
    preData: number[]
    blocks: number[]
  }
}

// any extension label without a dedicated schema (0x21 introducer):
// the raw label and concatenated sub-block data are preserved verbatim
// so unknown metadata can be passed through (e.g. by editors)
type UnknownExtension = {
  extension: {
    codes: number[]
    blocks: number[]
  }
}

type Frame = {
  gce: {
    byteSize: number
    codes: number[]
    delay: number
    terminator: number
    transparentColorIndex: number
    extras: {
      userInput: boolean
      transparentColorGiven: boolean
      future: number
      disposal: number
    }
  }
  image: {
    code: number
    data: {
      minCodeSize: number
      blocks: number[]
    }
    descriptor: {
      top: number
      left: number
      width: number
      height: number
      lct: {
        exists: boolean
        future: number
        interlaced: boolean
        size: number
        sort: boolean
      }
    }
  }
}

export type ParsedGif = {
  // every block of the file, in stable file order; repeated blocks of any
  // type each get their own entry, and consecutive blocks may share an entry
  frames: (Application | Comment | PlainText | UnknownExtension | Frame)[]
  gct: [number, number, number][]
  header: {
    signature: string
    version: string
  }
  lsd: {
    backgroundColorIndex: number
    gct: {
      exists: boolean
      resolution: number
      size: number
      sort: boolean
    }
    height: number
    width: number
    pixelAspectRatio: number
  }
}

export type ParsedFrame = {
  dims: { width: number; height: number; top: number; left: number }
  colorTable: [number, number, number][]
  delay: number
  disposalType: number
  patch: Uint8ClampedArray
  pixels: number[]
  transparentIndex: number
}

export type ParsedFrameWithoutPatch = Omit<ParsedFrame, 'patch'>

export function parseGIF(arrayBuffer: ArrayBuffer): ParsedGif

export function decompressFrames(
  parsedGif: ParsedGif,
  buildImagePatches: true
): ParsedFrame[]

export function decompressFrames(
  parsedGif: ParsedGif,
  buildImagePatches: false
): ParsedFrameWithoutPatch[]

export function decompressFrame(
  frame: Frame,
  gct: [number, number, number][],
  buildImagePatches: true
): ParsedFrame

export function decompressFrame(
  frame: Frame,
  gct: [number, number, number][],
  buildImagePatches: false
): ParsedFrameWithoutPatch
