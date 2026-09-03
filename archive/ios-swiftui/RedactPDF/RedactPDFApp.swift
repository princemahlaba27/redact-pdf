import SwiftUI

@main
struct RedactPDFApp: App {
    @StateObject private var subscriptionManager = SubscriptionManager.shared

    init() {
        if let apiKey = Bundle.main.object(forInfoDictionaryKey: "SuperwallAPIKey") as? String,
           !apiKey.isEmpty,
           apiKey != "YOUR_SUPERWALL_API_KEY" {
            Task { @MainActor in
                SubscriptionManager.shared.configure(apiKey: apiKey)
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            MainDashboardView()
                .environmentObject(subscriptionManager)
                .preferredColorScheme(.dark)
        }
    }
}
