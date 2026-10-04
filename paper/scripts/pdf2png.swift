// Renders PDF pages to PNG for visual review.
// Usage: swift paper/scripts/pdf2png.swift <file.pdf> <outDir> [scale] [firstPage] [lastPage]
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3, let doc = CGPDFDocument(URL(fileURLWithPath: args[1]) as CFURL) else {
  fputs("usage: pdf2png <file.pdf> <outDir> [scale] [first] [last]\n", stderr)
  exit(1)
}
let outDir = args[2]
let scale = CGFloat(args.count > 3 ? Double(args[3]) ?? 1.5 : 1.5)
let first = args.count > 4 ? Int(args[4]) ?? 1 : 1
let last = args.count > 5 ? Int(args[5]) ?? doc.numberOfPages : doc.numberOfPages
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
print("pages", doc.numberOfPages)
for n in max(1, first)...min(last, doc.numberOfPages) {
  guard let page = doc.page(at: n) else { continue }
  let box = page.getBoxRect(.mediaBox)
  let w = Int(box.width * scale), h = Int(box.height * scale)
  guard let ctx = CGContext(
    data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else { continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -box.origin.x, y: -box.origin.y)
  ctx.drawPDFPage(page)
  guard let image = ctx.makeImage(),
    let dest = CGImageDestinationCreateWithURL(
      URL(fileURLWithPath: String(format: "%@/page-%02d.png", outDir, n)) as CFURL,
      UTType.png.identifier as CFString, 1, nil)
  else { continue }
  CGImageDestinationAddImage(dest, image, nil)
  CGImageDestinationFinalize(dest)
}
print("done")
