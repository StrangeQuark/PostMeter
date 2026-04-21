package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.CollectionModel;
import com.strangequark.postmeter.model.RequestModel;
import com.strangequark.postmeter.model.WorkspaceData;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkspaceStoreTest {
    @TempDir
    Path tempDir;

    @Test
    void createsDefaultWorkspaceWhenFileDoesNotExist() throws Exception {
        Path workspacePath = tempDir.resolve("workspace.json");
        WorkspaceStore store = new WorkspaceStore(workspacePath);

        WorkspaceData workspace = store.load();

        assertTrue(workspacePath.toFile().exists());
        assertEquals(1, workspace.getSchemaVersion());
        assertTrue(workspace.getCollections().stream().anyMatch(collection -> collection.getName().equals("Getting Started")));
    }

    @Test
    void savesAndLoadsWorkspace() throws Exception {
        Path workspacePath = tempDir.resolve("workspace.json");
        WorkspaceStore store = new WorkspaceStore(workspacePath);
        WorkspaceData workspace = new WorkspaceData();
        CollectionModel collection = new CollectionModel("Regression");
        collection.getRequests().add(new RequestModel("Health", "GET", "https://example.com/health"));
        workspace.getCollections().add(collection);

        store.save(workspace);
        WorkspaceData loaded = store.load();

        assertEquals("Regression", loaded.getCollections().getFirst().getName());
        assertEquals("Health", loaded.getCollections().getFirst().getRequests().getFirst().getName());
    }

    @Test
    void defaultPathCanBeOverriddenWithSystemProperty() {
        String previous = System.getProperty(WorkspaceStore.DATA_PATH_PROPERTY);
        Path configuredPath = tempDir.resolve("configured.json");
        try {
            System.setProperty(WorkspaceStore.DATA_PATH_PROPERTY, configuredPath.toString());

            assertEquals(configuredPath, WorkspaceStore.defaultWorkspacePath());
        } finally {
            if (previous == null) {
                System.clearProperty(WorkspaceStore.DATA_PATH_PROPERTY);
            } else {
                System.setProperty(WorkspaceStore.DATA_PATH_PROPERTY, previous);
            }
        }
    }
}
