pragma Singleton
import QtQuick
import NodeTool.Timeline
QtObject {
    readonly property int controlSm: Theme.controlXs + Theme.spacingXs
    readonly property int controlMd: Theme.controlXs + Theme.spacingMd
    readonly property int controlXl: Theme.controlXs + Theme.spacingXl + Theme.spacingXs
    readonly property int rowControlMinWidth: 112
    readonly property int staticValueMaxWidth: 160
    readonly property int sectionIndent: Theme.spacingXl * 2
}
