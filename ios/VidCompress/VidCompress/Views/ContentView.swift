import SwiftUI

struct ContentView: View {
    @EnvironmentObject var vm: CompressorViewModel
    @State private var showPicker = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if vm.phase == .idle && !vm.isImporting {
                        pickSection
                    }

                    if vm.isImporting {
                        VStack(spacing: 12) {
                            ProgressView()
                                .controlSize(.large)
                            Text("Importing video…")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 40)
                    }

                    if vm.metadata != nil {
                        InputPreviewView()
                    }

                    if vm.phase == .previewing {
                        SettingsView()
                    }

                    if vm.phase == .compressing {
                        CompressionProgressView()
                    }

                    if let error = vm.errorMessage {
                        Text(error)
                            .font(.callout)
                            .foregroundStyle(.red)
                            .padding()
                    }

                    if vm.phase == .result, let result = vm.result, let inputURL = vm.inputURL, let meta = vm.metadata {
                        ComparisonView(inputURL: inputURL, outputURL: result.outputURL, videoSize: meta.naturalSize)
                        ResultView()
                    }
                }
                .padding()
            }
            .navigationTitle("VidCompress")
            .toolbar {
                if vm.phase != .idle && vm.phase != .compressing {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            vm.reset()
                        } label: {
                            Image(systemName: "arrow.counterclockwise")
                        }
                    }
                }
                if vm.phase == .previewing || vm.phase == .idle {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            showPicker = true
                        } label: {
                            Image(systemName: "photo.on.rectangle.angled")
                        }
                    }
                }
            }
            .sheet(isPresented: $showPicker) {
                VideoPickerView { url in
                    Task { await vm.loadVideo(from: url) }
                }
            }
        }
    }

    private var pickSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "video.badge.plus")
                .font(.system(size: 48))
                .foregroundStyle(.indigo)

            Text("Select a video to compress")
                .font(.headline)

            Text("Hardware-accelerated compression\nright on your iPhone")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                showPicker = true
            } label: {
                Label("Choose Video", systemImage: "photo.on.rectangle")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(.indigo)
        }
        .padding(.vertical, 40)
    }
}
