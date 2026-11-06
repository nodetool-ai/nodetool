// FontPicker from the web. Text prefix matches package I's owns pattern.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

InspectorSelect {
    id: root
    readonly property var bundledFamilies: ["Inter", "Space Grotesk", "Bebas Neue", "Playfair Display", "Lora", "JetBrains Mono"]
    readonly property var installedFamilies: Qt.fontFamilies()
    grow: true
    // Observe options so selection updates when the computed model arrives after value.
    currentIndex: options.findIndex(option => option.value === value)
    // A model reset can overwrite currentIndex after its options binding has run.
    onCountChanged: Qt.callLater(() => {
        root.currentIndex = Qt.binding(() => root.options.findIndex(option => option.value === root.value));
    })
    options: {
        const listed = bundledFamilies.map(name => ({
                    value: name,
                    label: name + " · portable"
                }));
        const known = new Set(bundledFamilies);
        for (const name of installedFamilies) {
            if (!known.has(name)) {
                listed.push({
                    value: name,
                    label: name
                });
                known.add(name);
            }
        }
        if (value && !known.has(value))
            listed.push({
                value,
                label: value + " · not installed"
            });
        return [
            {
                value: "",
                label: "Default (Inter)"
            }
        ].concat(listed);
    }
}
