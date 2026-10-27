import QtQuick
TestSlotProbe {
    objectName: "probe-toolbar"
    onActivated: {
        viewState.rulerMode = viewState.rulerMode === "bars" ? "time" : "bars"
        viewState.gridDivision = "eighth"
    }
}
