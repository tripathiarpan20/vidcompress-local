import Foundation

enum BitrateCalculator {
    static func bitrate(quality: Int, outputWidth: Int, outputHeight: Int) -> Int {
        let pixels = Double(outputWidth * outputHeight)
        let pixelFactor = pixels / (1920.0 * 1080.0)
        let br = 200_000.0 * pow(25_000_000.0 / 200_000.0, Double(quality) / 100.0) * pixelFactor
        return max(Int(br), 100_000)
    }
}
