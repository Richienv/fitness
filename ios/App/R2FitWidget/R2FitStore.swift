import Foundation

/// Everything the widget knows about the account, and how it asks the server
/// for today's numbers.
///
/// The extension has no cookies and no Prisma. It reads a signed read-only
/// token the app wrote into the shared App Group (see R2WidgetBridge.swift)
/// and calls the same `/api/widget/today` endpoint the Scriptable widget uses,
/// which is backed by the same `todaySnapshot()` aggregator as the app — so
/// the home screen and the app can't disagree.
enum R2FitStore {
    /// Must match R2WidgetBridge.appGroup and the App Group on both targets.
    static let appGroup = "group.com.richienv.r2fit"
    static let fallbackBase = "https://r2-fit.vercel.app"

    private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static var token: String? {
        guard let t = defaults?.string(forKey: "widgetToken"), !t.isEmpty else { return nil }
        return t
    }

    static var apiBase: String {
        let b = defaults?.string(forKey: "apiBase") ?? ""
        return b.isEmpty ? fallbackBase : b
    }

    static var kcalTarget: Int { defaults?.integer(forKey: "kcalTarget") ?? 0 }
    static var proteinTarget: Int { defaults?.integer(forKey: "proteinTarget") ?? 0 }
}

struct R2Today {
    var kcal: Int
    var protein: Int
    var carbs: Int
    var fat: Int
    var sugar: Int
    var kcalTarget: Int
    var proteinTarget: Int

    var remaining: Int { max(0, kcalTarget - kcal) }
    var fraction: Double {
        guard kcalTarget > 0 else { return 0 }
        return min(1, max(0, Double(kcal) / Double(kcalTarget)))
    }
    var proteinFraction: Double {
        guard proteinTarget > 0 else { return 0 }
        return min(1, max(0, Double(protein) / Double(proteinTarget)))
    }

    static let placeholder = R2Today(
        kcal: 1240, protein: 96, carbs: 132, fat: 41, sugar: 18,
        kcalTarget: 2200, proteinTarget: 175
    )
}

/// What the widget is showing right now. `.signedOut` and `.unreachable` are
/// distinct on purpose: one is fixed by opening the app, the other by waiting.
enum R2WidgetState {
    case ready(R2Today)
    case signedOut
    case unreachable
}

enum R2FitAPI {
    private struct Envelope: Decodable {
        struct Totals: Decodable { let kcal, protein, carbs, fat, sugar: Double }
        struct Targets: Decodable { let kcal, protein: Double }
        struct Payload: Decodable { let totals: Totals; let targets: Targets }
        let ok: Bool
        let data: Payload?
    }

    static func fetchToday() async -> R2WidgetState {
        guard let token = R2FitStore.token else { return .signedOut }

        var components = URLComponents(string: R2FitStore.apiBase + "/api/widget/today")
        var query = [URLQueryItem(name: "token", value: token)]
        // Fallbacks only: the endpoint prefers the target saved server-side.
        if R2FitStore.kcalTarget > 0 {
            query.append(URLQueryItem(name: "kt", value: String(R2FitStore.kcalTarget)))
        }
        if R2FitStore.proteinTarget > 0 {
            query.append(URLQueryItem(name: "pt", value: String(R2FitStore.proteinTarget)))
        }
        components?.queryItems = query
        guard let url = components?.url else { return .unreachable }

        var request = URLRequest(url: url)
        // A widget refresh that hangs burns the extension's time budget and
        // the slot is lost; better to show stale numbers and retry later.
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 401 {
                return .signedOut
            }
            let envelope = try JSONDecoder().decode(Envelope.self, from: data)
            guard envelope.ok, let d = envelope.data else { return .unreachable }
            return .ready(R2Today(
                kcal: Int(d.totals.kcal.rounded()),
                protein: Int(d.totals.protein.rounded()),
                carbs: Int(d.totals.carbs.rounded()),
                fat: Int(d.totals.fat.rounded()),
                sugar: Int(d.totals.sugar.rounded()),
                kcalTarget: Int(d.targets.kcal.rounded()),
                proteinTarget: Int(d.targets.protein.rounded())
            ))
        } catch {
            return .unreachable
        }
    }
}
