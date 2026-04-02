import AVFoundation
import AVKit
import SwiftUI

struct ComparisonView: View {
    let inputURL: URL
    let outputURL: URL
    let videoSize: CGSize

    @State private var sliderFraction: CGFloat = 0.5
    @State private var originalPlayer: AVPlayer?
    @State private var compressedPlayer: AVPlayer?
    @State private var isPlaying = false
    @State private var seekPosition: Double = 0
    @State private var duration: Double = 1
    @State private var timeObserver: Any?

    private var aspectRatio: CGFloat {
        guard videoSize.height > 0 else { return 16.0 / 9.0 }
        return videoSize.width / videoSize.height
    }

    var body: some View {
        VStack(spacing: 10) {
            Text("COMPARE")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            GeometryReader { geo in
                ZStack {
                    // Bottom: compressed
                    if let player = compressedPlayer {
                        PlayerLayerView(player: player)
                    }

                    // Top: original, clipped from left to slider position
                    if let player = originalPlayer {
                        PlayerLayerView(player: player)
                            .clipShape(HorizontalClip(fraction: sliderFraction))
                    }

                    // Divider
                    Rectangle()
                        .fill(.white)
                        .frame(width: 2)
                        .position(x: geo.size.width * sliderFraction, y: geo.size.height / 2)
                        .shadow(radius: 2)

                    // Labels
                    HStack {
                        Text("Original")
                            .font(.caption2.weight(.semibold))
                            .padding(4)
                            .background(.ultraThinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        Spacer()
                        Text("Compressed")
                            .font(.caption2.weight(.semibold))
                            .padding(4)
                            .background(.ultraThinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 8)
                    .frame(maxHeight: .infinity, alignment: .top)
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            sliderFraction = max(0, min(1, value.location.x / geo.size.width))
                        }
                )
            }
            .aspectRatio(aspectRatio, contentMode: .fit)
            .frame(maxHeight: 400)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Playback controls
            HStack(spacing: 16) {
                Button {
                    togglePlayback()
                } label: {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.title3)
                }

                Slider(value: $seekPosition, in: 0...1) { editing in
                    if !editing {
                        seekBoth(to: seekPosition)
                    }
                }
                .tint(.indigo)
            }
            .padding(.horizontal)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onAppear { setupPlayers() }
        .onDisappear { tearDown() }
    }

    private func setupPlayers() {
        let op = AVPlayer(url: inputURL)
        let cp = AVPlayer(url: outputURL)
        op.isMuted = true
        cp.isMuted = false
        originalPlayer = op
        compressedPlayer = cp

        // Load duration and seek to first frame
        Task {
            let asset = AVURLAsset(url: inputURL)
            if let d = try? await asset.load(.duration) {
                await MainActor.run {
                    duration = d.seconds > 0 ? d.seconds : 1
                }
            }
            await op.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
            await cp.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
        }

        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = op.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
            guard duration > 0 else { return }
            seekPosition = time.seconds / duration

            if let cp = compressedPlayer {
                let drift = abs(cp.currentTime().seconds - time.seconds)
                if drift > 0.15 {
                    cp.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
                }
            }
        }
    }

    private func togglePlayback() {
        if isPlaying {
            originalPlayer?.pause()
            compressedPlayer?.pause()
        } else {
            originalPlayer?.play()
            compressedPlayer?.play()
        }
        isPlaying.toggle()
    }

    private func seekBoth(to fraction: Double) {
        let time = CMTime(seconds: fraction * duration, preferredTimescale: 600)
        originalPlayer?.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
        compressedPlayer?.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    private func tearDown() {
        if let observer = timeObserver {
            originalPlayer?.removeTimeObserver(observer)
        }
        originalPlayer?.pause()
        compressedPlayer?.pause()
    }
}

struct HorizontalClip: Shape {
    var fraction: CGFloat

    var animatableData: CGFloat {
        get { fraction }
        set { fraction = newValue }
    }

    func path(in rect: CGRect) -> Path {
        Path(CGRect(x: 0, y: 0, width: rect.width * fraction, height: rect.height))
    }
}
