import WidgetKit
import SwiftUI

// MARK: - Palette (mirrors the app's "fire" theme)

private enum Fire {
    static let hot = Color(red: 1.00, green: 0.54, blue: 0.32)      // #ff8a52
    static let core = Color(red: 0.93, green: 0.24, blue: 0.19)     // #ee3c30
    static let text = Color(red: 1.00, green: 0.91, blue: 0.84)     // #ffe9d6
    static let muted = Color(red: 0.54, green: 0.51, blue: 0.49)    // #8a837d
    static let protein = Color(red: 0.37, green: 0.89, blue: 0.60)
    static let carbs = Color(red: 0.35, green: 0.78, blue: 0.96)
    static let fat = Color(red: 0.92, green: 0.70, blue: 0.03)
    static let sugar = Color(red: 1.00, green: 0.54, blue: 0.45)

    static let background = LinearGradient(
        colors: [Color(red: 0.11, green: 0.07, blue: 0.06), Color(red: 0.04, green: 0.03, blue: 0.04)],
        startPoint: .top, endPoint: .bottom
    )
    static let bar = LinearGradient(colors: [hot, core], startPoint: .leading, endPoint: .trailing)
}

// MARK: - Timeline

struct R2Entry: TimelineEntry {
    let date: Date
    let state: R2WidgetState
}

struct R2Provider: TimelineProvider {
    func placeholder(in context: Context) -> R2Entry {
        R2Entry(date: Date(), state: .ready(.placeholder))
    }

    func getSnapshot(in context: Context, completion: @escaping (R2Entry) -> Void) {
        // The gallery preview must never show a spinner or an error.
        if context.isPreview {
            completion(R2Entry(date: Date(), state: .ready(.placeholder)))
            return
        }
        Task { completion(R2Entry(date: Date(), state: await R2FitAPI.fetchToday())) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<R2Entry>) -> Void) {
        Task {
            let state = await R2FitAPI.fetchToday()
            // iOS treats this as a hint and rations refreshes across the day.
            // 15 minutes is about as often as it will honour for a widget that
            // hits the network; anything tighter just wastes the budget.
            let next = Date().addingTimeInterval(15 * 60)
            completion(Timeline(entries: [R2Entry(date: Date(), state: state)], policy: .after(next)))
        }
    }
}

// MARK: - Pieces

private struct MacroChip: View {
    let value: Int
    let unit: String
    let color: Color

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 1) {
            Text("\(value)").font(.system(size: 11, weight: .bold)).foregroundColor(color)
            Text(unit).font(.system(size: 8, weight: .medium)).foregroundColor(Fire.muted)
        }
    }
}

private struct ProgressBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.10))
                Capsule()
                    .fill(Fire.bar)
                    // A zero-width capsule reads as a rendering bug rather than
                    // "nothing logged yet", so always leave a visible nub.
                    .frame(width: max(5, geo.size.width * fraction))
            }
        }
        .frame(height: 7)
    }
}

private struct Message: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("R2·FIT").font(.system(size: 14, weight: .heavy)).foregroundColor(Fire.hot)
            Text(title).font(.system(size: 12, weight: .semibold)).foregroundColor(Fire.text)
            Text(detail).font(.system(size: 9)).foregroundColor(Fire.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - Small

private struct SmallView: View {
    let today: R2Today

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("🔥 MAKAN").font(.system(size: 10.5, weight: .heavy)).foregroundColor(Fire.hot)
                Spacer()
                Text("HARI INI").font(.system(size: 8, weight: .medium)).foregroundColor(Fire.muted)
            }
            Spacer(minLength: 8)
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text("\(today.kcal)")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundColor(Fire.text)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text("/ \(today.kcalTarget)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Fire.muted)
            }
            Text("\(today.remaining) kkal sisa")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Fire.hot)
            Spacer(minLength: 8)
            ProgressBar(fraction: today.fraction)
            Spacer(minLength: 9)
            HStack(spacing: 8) {
                MacroChip(value: today.protein, unit: "p", color: Fire.protein)
                MacroChip(value: today.carbs, unit: "c", color: Fire.carbs)
                MacroChip(value: today.fat, unit: "f", color: Fire.fat)
                MacroChip(value: today.sugar, unit: "s", color: Fire.sugar)
            }
        }
    }
}

// MARK: - Medium

private struct Ring: View {
    let fraction: Double
    let colors: [Color]
    let label: String
    let value: String
    let sub: String

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle().stroke(Color.white.opacity(0.09), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: max(0.001, fraction))
                    .stroke(
                        AngularGradient(colors: colors, center: .center),
                        style: StrokeStyle(lineWidth: 8, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 1) {
                    Text(value).font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                        .minimumScaleFactor(0.6).lineLimit(1)
                    Text(sub).font(.system(size: 7.5)).foregroundColor(Fire.muted)
                }
                .padding(6)
            }
            .frame(width: 62, height: 62)
            Text(label).font(.system(size: 8, weight: .medium)).foregroundColor(Fire.muted)
        }
    }
}

private struct MediumView: View {
    let today: R2Today

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("🔥 MAKAN").font(.system(size: 10.5, weight: .heavy)).foregroundColor(Fire.hot)
                    Spacer()
                    Text("HARI INI").font(.system(size: 8, weight: .medium)).foregroundColor(Fire.muted)
                }
                Spacer(minLength: 6)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text("\(today.kcal)")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(Fire.text)
                        .minimumScaleFactor(0.6).lineLimit(1)
                    Text("/ \(today.kcalTarget)")
                        .font(.system(size: 10, weight: .medium)).foregroundColor(Fire.muted)
                }
                Text("\(today.remaining) kkal sisa")
                    .font(.system(size: 10, weight: .semibold)).foregroundColor(Fire.hot)
                Spacer(minLength: 8)
                ProgressBar(fraction: today.fraction)
                Spacer(minLength: 8)
                HStack(spacing: 9) {
                    MacroChip(value: today.carbs, unit: "c", color: Fire.carbs)
                    MacroChip(value: today.fat, unit: "f", color: Fire.fat)
                    MacroChip(value: today.sugar, unit: "s", color: Fire.sugar)
                }
            }
            Ring(
                fraction: today.proteinFraction,
                colors: [Fire.protein, Color(red: 0.12, green: 0.68, blue: 0.35), Fire.protein],
                label: "PROTEIN",
                value: "\(today.protein)g",
                sub: "/ \(today.proteinTarget)g"
            )
        }
    }
}

// MARK: - Entry point

struct R2FitWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: R2Entry

    @ViewBuilder private var content: some View {
        switch entry.state {
        case .ready(let today):
            if family == .systemMedium { MediumView(today: today) } else { SmallView(today: today) }
        case .signedOut:
            Message(title: "Belum tersambung", detail: "Buka app → Settings → iPhone Widget")
        case .unreachable:
            Message(title: "Nggak ada koneksi", detail: "Nanti dicoba lagi otomatis")
        }
    }

    var body: some View {
        content
            .widgetURL(URL(string: "r2fit://meal?add=1"))
            .r2WidgetBackground(Fire.background)
    }
}

private extension View {
    /// iOS 17 moved widget backgrounds behind `containerBackground`; without it
    /// a widget built against the new SDK renders on white in StandBy and on
    /// the Lock Screen. The old modifier still has to be there for iOS 16.
    @ViewBuilder
    func r2WidgetBackground<B: View>(_ background: B) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.padding(14).containerBackground(for: .widget) { background }
        } else {
            self.padding(14).background(background)
        }
    }
}

struct R2FitWidget: Widget {
    let kind = "R2FitWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: R2Provider()) { entry in
            R2FitWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("R2·FIT — Makan")
        .description("Kalori dan makro hari ini.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

@main
struct R2FitWidgetBundle: WidgetBundle {
    var body: some Widget {
        R2FitWidget()
    }
}
