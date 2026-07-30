//
//  majorApp.swift
//  major
//
//  Created by Arb Karan on 7/27/26.
//

import SwiftUI

@main
struct majorApp: App {
    var body: some Scene {
        DocumentGroup(newDocument: majorDocument()) { file in
            ContentView(document: file.$document)
        }
    }
}
