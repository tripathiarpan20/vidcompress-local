import SwiftUI
import AVFoundation

enum AppPhase {
    case idle
    case previewing
    case compressing
    case result
}

@MainActor
class CompressorViewModel: ObservableObject {
    @Published var phase: AppPhase = .idle
    @Published var settings = CompressionSettings()
    @Published var metadata: VideoMetadata?
    @Published var inputURL: URL?
    @Published var progress: Double = 0
    @Published var progressMessage: String = ""
    @Published var result: CompressionResult?
    @Published var errorMessage: String?
    @Published var codecAvailability: [Codec: Bool] = [:]

    private let compressor = VideoCompressor()

    init() {
        codecAvailability = CodecAvailability.check()
    }

    func loadVideo(from url: URL) async {
        do {
            let meta = try await VideoMetadataExtractor.extract(from: url)
            inputURL = url
            metadata = meta
            settings = CompressionSettings()
            result = nil
            errorMessage = nil
            progress = 0
            phase = .previewing
        } catch {
            errorMessage = "Failed to load video: \(error.localizedDescription)"
        }
    }

    func startCompression() async {
        guard let url = inputURL, let meta = metadata else { return }

        phase = .compressing
        progress = 0
        progressMessage = "Starting…"
        errorMessage = nil

        do {
            let compressionResult = try await compressor.compress(
                input: url,
                settings: settings,
                metadata: meta
            ) { [weak self] prog, message in
                Task { @MainActor in
                    self?.progress = prog
                    self?.progressMessage = message
                }
            }
            result = compressionResult
            phase = .result
        } catch is CancellationError {
            phase = .previewing
        } catch CompressionError.cancelled {
            phase = .previewing
        } catch {
            errorMessage = error.localizedDescription
            phase = .previewing
        }
    }

    func cancelCompression() {
        Task {
            await compressor.cancel()
        }
    }

    func reset() {
        if let outputURL = result?.outputURL {
            try? FileManager.default.removeItem(at: outputURL)
        }
        phase = .idle
        inputURL = nil
        metadata = nil
        result = nil
        progress = 0
        errorMessage = nil
    }
}
