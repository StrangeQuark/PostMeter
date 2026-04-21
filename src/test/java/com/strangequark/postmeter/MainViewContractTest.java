package com.strangequark.postmeter;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class MainViewContractTest {
    @Test
    void fxmlContainsCoreWorkflowHandlers() throws Exception {
        String fxml = Files.readString(Path.of("src/main/resources/com/strangequark/postmeter/main-view.fxml"));

        assertTrue(fxml.contains("onAction=\"#handleNewCollection\""));
        assertTrue(fxml.contains("onAction=\"#handleNewRequest\""));
        assertTrue(fxml.contains("onAction=\"#handleSave\""));
        assertTrue(fxml.contains("onAction=\"#handleSend\""));
        assertTrue(fxml.contains("onAction=\"#handleImportWorkspace\""));
        assertTrue(fxml.contains("onAction=\"#handleExportWorkspace\""));
        assertTrue(fxml.contains("onAction=\"#handleImportCollection\""));
        assertTrue(fxml.contains("onAction=\"#handleExportSelectedCollection\""));
        assertTrue(fxml.contains("onAction=\"#handleRunLoadTest\""));
        assertTrue(fxml.contains("onAction=\"#handleCancelLoadTest\""));
        assertTrue(fxml.contains("fx:id=\"validationLabel\""));
        assertTrue(fxml.contains("fx:id=\"cancelLoadTestButton\""));
    }
}
