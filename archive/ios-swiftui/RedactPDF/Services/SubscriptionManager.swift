import Combine
import Foundation
import StoreKit
import SuperwallKit

@MainActor
final class SubscriptionManager: ObservableObject {
    static let shared = SubscriptionManager()

    @Published private(set) var isSubscribed = false
    @Published private(set) var isLoading = false

    private var cancellables = Set<AnyCancellable>()

    private init() {
        refreshSubscriptionStatus()
    }

    func configure(apiKey: String) {
        Superwall.configure(apiKey: apiKey)
        Superwall.shared.delegate = SuperwallDelegateHandler.shared
        SuperwallDelegateHandler.shared.onSubscriptionChange = { [weak self] subscribed in
            Task { @MainActor in
                self?.isSubscribed = subscribed
            }
        }
    }

    func refreshSubscriptionStatus() {
        isSubscribed = Superwall.shared.subscriptionStatus.isActive
    }

    /// Presents the export paywall. Returns true when the user may proceed with export.
    func requestExportAccess() async -> Bool {
        if isSubscribed {
            return true
        }

        isLoading = true
        defer { isLoading = false }

        return await withCheckedContinuation { continuation in
            SuperwallDelegateHandler.shared.exportContinuation = continuation

            Superwall.shared.register(event: "export_pdf") {
                Task { @MainActor in
                    self.isSubscribed = Superwall.shared.subscriptionStatus.isActive
                    SuperwallDelegateHandler.shared.exportContinuation?.resume(returning: self.isSubscribed)
                    SuperwallDelegateHandler.shared.exportContinuation = nil
                }
            }
        }
    }

    func restorePurchases() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await AppStore.sync()
            refreshSubscriptionStatus()
            HapticManager.notification(isSubscribed ? .success : .warning)
        } catch {
            HapticManager.notification(.error)
        }
    }

    func purchaseViaPaywall() {
        Superwall.shared.register(event: "paywall_purchase") { [weak self] in
            Task { @MainActor in
                self?.refreshSubscriptionStatus()
            }
        }
    }
}

// MARK: - Superwall Delegate

final class SuperwallDelegateHandler: SuperwallDelegate {
    static let shared = SuperwallDelegateHandler()

    var onSubscriptionChange: ((Bool) -> Void)?
    var exportContinuation: CheckedContinuation<Bool, Never>?

    func subscriptionStatusDidChange(from oldValue: SubscriptionStatus, to newValue: SubscriptionStatus) {
        onSubscriptionChange?(newValue.isActive)
    }

    func handleSuperwallEvent(withInfo eventInfo: SuperwallEventInfo) {
        switch eventInfo.event {
        case .transactionComplete, .subscriptionStart, .freeTrialStart:
            onSubscriptionChange?(true)
            exportContinuation?.resume(returning: true)
            exportContinuation = nil
        case .paywallClose where exportContinuation != nil:
            exportContinuation?.resume(returning: Superwall.shared.subscriptionStatus.isActive)
            exportContinuation = nil
        default:
            break
        }
    }
}

private extension SubscriptionStatus {
    var isActive: Bool {
        switch self {
        case .active:
            return true
        case .inactive, .unknown:
            return false
        @unknown default:
            return false
        }
    }
}
