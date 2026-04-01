import Foundation

struct CompressionResult {
    let outputURL: URL
    let outputSize: Int64
    let inputSize: Int64
    let elapsedTime: TimeInterval
    let videoDuration: TimeInterval

    var reductionPercent: Double {
        guard inputSize > 0 else { return 0 }
        return (1.0 - Double(outputSize) / Double(inputSize)) * 100
    }

    var speed: Double {
        guard elapsedTime > 0 else { return 0 }
        return videoDuration / elapsedTime
    }
}
