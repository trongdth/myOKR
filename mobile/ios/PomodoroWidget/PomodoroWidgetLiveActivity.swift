//
//  PomodoroWidgetLiveActivity.swift
//  PomodoroWidget
//
//  Created by Trong Dinh on 24/6/26.
//

import WidgetKit
import SwiftUI
import ActivityKit

// 1. Define the Attributes that match our Dart Payload
struct PomodoroTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic data updated from Flutter
        var remainingSeconds: Int
        var taskName: String
        var sessionType: String
        var isBreak: Bool
        var targetEndTime: Double
    }

    // Static data (if any)
    var timerName: String
}

// 2. Build the Lock Screen UI
struct PomodoroWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PomodoroTimerAttributes.self) { context in
            // Lock screen / Banner UI
            VStack {
                HStack {
                    Image(systemName: context.state.isBreak ? "cup.and.saucer.fill" : "brain.head.profile")
                        .foregroundColor(context.state.isBreak ? .green : .cyan)
                    
                    Text(context.state.sessionType.uppercased())
                        .font(.headline)
                        .foregroundColor(context.state.isBreak ? .green : .cyan)
                    
                    Spacer()
                    
                    // Native Countdown Timer
                    Text(timerInterval: Date()...Date(timeIntervalSince1970: context.state.targetEndTime / 1000), countsDown: true)
                        .font(.system(.title, design: .monospaced))
                        .fontWeight(.bold)
                }
                
                HStack {
                    Text(context.state.taskName)
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .lineLimit(1)
                    Spacer()
                }
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.8))
            .activitySystemActionForegroundColor(Color.cyan)
            
        } dynamicIsland: { context in
            // Dynamic Island UI (iPhone 14 Pro+)
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.state.isBreak ? "cup.and.saucer.fill" : "brain.head.profile")
                        .foregroundColor(context.state.isBreak ? .green : .cyan)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...Date(timeIntervalSince1970: context.state.targetEndTime / 1000), countsDown: true)
                        .font(.system(.title2, design: .monospaced))
                        .foregroundColor(.cyan)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.taskName)
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            } compactLeading: {
                Image(systemName: context.state.isBreak ? "cup.and.saucer.fill" : "brain.head.profile")
                    .foregroundColor(context.state.isBreak ? .green : .cyan)
            } compactTrailing: {
                Text(timerInterval: Date()...Date(timeIntervalSince1970: context.state.targetEndTime / 1000), countsDown: true)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(.cyan)
            } minimal: {
                Image(systemName: context.state.isBreak ? "cup.and.saucer.fill" : "brain.head.profile")
                    .foregroundColor(context.state.isBreak ? .green : .cyan)
            }
        }
    }
}
