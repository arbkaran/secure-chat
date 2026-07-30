//
//  ContentView.swift
//  major
//
//  Created by Arb Karan on 7/27/26.
//

import SwiftUI

struct ContentView: View {
    @Binding var document: majorDocument

    var body: some View {
        TextEditor(text: $document.text)
    }
}

#Preview {
    ContentView(document: .constant(majorDocument()))
}
