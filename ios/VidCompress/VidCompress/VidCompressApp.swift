import SwiftUI

@main
struct VidCompressApp: App {
    @StateObject private var viewModel = CompressorViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active && viewModel.phase == .result {
                        // Keep result visible when returning
                    }
                }
        }
    }
}
