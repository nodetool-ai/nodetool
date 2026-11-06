#include "ai/WorkflowInputs.h"
#include <QJsonArray>
#include <QtTest>

class WorkflowInputsTest : public QObject {
    Q_OBJECT
private slots:
    void valuesAndDefaults() {
        const QJsonArray nodes{
            QJsonObject{{"id", "a"}, {"type", "nodetool.input.StringInput"}, {"data", QJsonObject{{"name", "prompt"}, {"label", "Prompt"}, {"value", "default"}, {"max_length", 14.8}, {"line_mode", "multi_line"}}}},
            QJsonObject{{"id", "b"}, {"type", "nodetool.input.BooleanInput"}, {"data", QJsonObject{{"name", "enabled"}}}},
            QJsonObject{{"id", "c"}, {"type", "nodetool.input.IntegerInput"}, {"data", QJsonObject{{"name", "count"}, {"min", 1}, {"max", 9}, {"value", 3}}}},
            QJsonObject{{"id", "d"}, {"type", "nodetool.input.SelectInput"}, {"data", QJsonObject{{"name", "style"}, {"options", QJsonArray{"soft", "hard"}}}}},
            QJsonObject{{"id", "e"}, {"type", "nodetool.input.ImageInput"}, {"data", QJsonObject{{"name", "image"}}}},
            QJsonObject{{"id", "f"}, {"type", "nodetool.input.TextListInput"}, {"data", QJsonObject{{"name", "texts"}}}},
            QJsonObject{{"id", "g"}, {"type", "some.other.Node"}, {"data", QJsonObject{{"name", "ignored"}}}}};
        const QJsonObject graph{{"graph", QJsonObject{{"nodes", nodes}}}};
        const QJsonObject image{{"type", "image"}, {"asset_id", "asset"}};
        const auto rows = nt::ai::workflowInputs(graph, {{"prompt", "override"}, {"count", QJsonValue::Null}, {"image", image}});
        QCOMPARE(rows.size(), 6);
        QCOMPARE(rows[0].toObject().value("name").toString(), QString("prompt"));
        QCOMPARE(rows[0].toObject().value("value").toString(), QString("override"));
        QCOMPARE(rows[0].toObject().value("maxLength").toInt(), 14);
        QVERIFY(rows[0].toObject().value("multiline").toBool());
        QCOMPARE(rows[1].toObject().value("value").toBool(), false);
        QVERIFY(rows[2].toObject().value("value").isNull());
        QCOMPARE(rows[2].toObject().value("min").toInt(), 1);
        QCOMPARE(rows[3].toObject().value("value").toString(), QString("soft"));
        QCOMPARE(rows[4].toObject().value("value").toObject(), image);
        QVERIFY(rows[5].toObject().value("value").isArray());
        const auto defaults = nt::ai::workflowInputs(graph, {});
        QVERIFY(!defaults[4].toObject().value("hasValue").toBool());
        QCOMPARE(defaults[2].toObject().value("value").toInt(), 3);
    }
    void allKinds() {
        const QList<QPair<QString, QString>> kinds{
            {"StringInput", "string"}, {"TextInput", "string"}, {"MessageInput", "string"}, {"BooleanInput", "boolean"},
            {"IntegerInput", "integer"}, {"FloatInput", "float"}, {"ColorInput", "color"}, {"ImageInput", "image"},
            {"VideoInput", "video"}, {"AudioInput", "audio"}, {"RealtimeAudioInput", "audio"}, {"DocumentInput", "document"},
            {"DataFrameInput", "dataframe"}, {"DataframeInput", "dataframe"}, {"Model3DInput", "model3d"},
            {"ImageSizeInput", "image_size"}, {"HuggingFaceModelInput", "huggingface_model"}, {"FilePathInput", "file_path"},
            {"FolderPathInput", "folder_path"}, {"Folder", "folder"}, {"SelectInput", "select"}, {"LanguageModelInput", "language_model"},
            {"ImageModelInput", "image_model"}, {"VideoModelInput", "video_model"}, {"TTSModelInput", "tts_model"},
            {"ASRModelInput", "asr_model"}, {"MusicModelInput", "music_model"}, {"EmbeddingModelInput", "embedding_model"},
            {"ImageListInput", "image_list"}, {"VideoListInput", "video_list"}, {"AudioListInput", "audio_list"},
            {"TextListInput", "text_list"}, {"StringListInput", "text_list"}, {"ValueInput", "value"}};
        QJsonArray nodes;
        for (const auto& item : kinds) nodes.append(QJsonObject{{"id", item.first}, {"type", "nodetool.input." + item.first}, {"data", QJsonObject{{"name", item.first}}}});
        const auto rows = nt::ai::workflowInputs({{"graph", QJsonObject{{"nodes", nodes}}}}, {});
        QCOMPARE(rows.size(), kinds.size());
        for (int i = 0; i < rows.size(); ++i) QCOMPARE(rows[i].toObject().value("kind").toString(), kinds[i].second);
    }
};
QTEST_GUILESS_MAIN(WorkflowInputsTest)
#include "tst_workflowinputs.moc"
