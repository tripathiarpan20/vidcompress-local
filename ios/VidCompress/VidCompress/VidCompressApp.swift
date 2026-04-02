import SwiftUI

@main
struct VidCompressApp: App {
    @StateObject private var viewModel = CompressorViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
        }
    }
}
