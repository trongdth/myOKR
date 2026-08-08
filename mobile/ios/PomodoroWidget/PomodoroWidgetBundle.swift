//
//  PomodoroWidgetBundle.swift
//  PomodoroWidget
//
//  Created by Trong Dinh on 24/6/26.
//

import WidgetKit
import SwiftUI

@main
struct PomodoroWidgetBundle: WidgetBundle {
    var body: some Widget {
        PomodoroWidget()
        PomodoroWidgetControl()
        PomodoroWidgetLiveActivity()
    }
}
