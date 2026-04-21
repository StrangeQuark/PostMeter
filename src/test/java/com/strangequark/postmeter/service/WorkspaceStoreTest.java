package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.CollectionModel;
import com.strangequark.postmeter.model.RequestModel;
import com.strangequark.postmeter.model.WorkspaceData;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
        assertEquals(WorkspaceStore.CURRENT_SCHEMA_VERSION, workspace.getSchemaVersion());
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

    @Test
    void migratesSchemaOneWorkspaceAndCreatesBackup() throws Exception {
        Path workspacePath = tempDir.resolve("workspace.json");
        Files.writeString(workspacePath, """
                {
                  "schemaVersion": 1,
                  "collections": [
                    {
                      "name": "Legacy",
                      "requests": [
                        {"name": "Legacy Request", "method": "GET", "url": "https://example.com"}
                      ]
                    }
                  ],
                  "environments": [],
                  "history": []
                }
                """);

        WorkspaceData workspace = new WorkspaceStore(workspacePath).load();

        assertEquals(WorkspaceStore.CURRENT_SCHEMA_VERSION, workspace.getSchemaVersion());
        assertEquals("Legacy", workspace.getCollections().getFirst().getName());
        try (Stream<Path> paths = Files.list(tempDir)) {
            assertTrue(paths.anyMatch(path -> path.getFileName().toString().contains("pre-migration.backup")));
        }
    }

    @Test
    void corruptWorkspaceIsQuarantinedAndDefaultWorkspaceIsCreated() throws Exception {
        Path workspacePath = tempDir.resolve("workspace.json");
        Files.writeString(workspacePath, "{not-valid-json");
        WorkspaceStore store = new WorkspaceStore(workspacePath);

        WorkspaceStore.WorkspaceRecoveryException exception = assertThrows(
                WorkspaceStore.WorkspaceRecoveryException.class,
                store::load
        );

        assertTrue(Files.exists(workspacePath));
        assertTrue(Files.exists(exception.getRecoveredPath()));
        assertTrue(exception.getRecoveredWorkspace().getCollections().stream()
                .anyMatch(collection -> collection.getName().equals("Getting Started")));
    }

    @Test
    void exportsAndImportsWorkspace() throws Exception {
        Path exportPath = tempDir.resolve("workspace.postmeter.json");
        WorkspaceStore store = new WorkspaceStore(tempDir.resolve("workspace.json"));
        WorkspaceData workspace = new WorkspaceData();
        CollectionModel collection = new CollectionModel("Shared");
        collection.getRequests().add(new RequestModel("List", "GET", "https://example.com/items"));
        workspace.getCollections().add(collection);

        store.exportWorkspace(workspace, exportPath);
        WorkspaceData imported = store.importWorkspace(exportPath);

        assertEquals(WorkspaceStore.CURRENT_SCHEMA_VERSION, imported.getSchemaVersion());
        assertEquals("Shared", imported.getCollections().getFirst().getName());
        assertEquals("List", imported.getCollections().getFirst().getRequests().getFirst().getName());
    }

    @Test
    void importsCollectionWithNewIdsForSharing() throws Exception {
        Path exportPath = tempDir.resolve("collection.postmeter.json");
        WorkspaceStore store = new WorkspaceStore(tempDir.resolve("workspace.json"));
        CollectionModel collection = new CollectionModel("Shared Collection");
        RequestModel request = new RequestModel("Get Item", "GET", "https://example.com/items/1");
        collection.getRequests().add(request);
        String originalCollectionId = collection.getId();
        String originalRequestId = request.getId();

        store.exportCollection(collection, exportPath);
        CollectionModel imported = store.importCollection(exportPath);

        assertEquals("Shared Collection", imported.getName());
        assertEquals("Get Item", imported.getRequests().getFirst().getName());
        assertNotEquals(originalCollectionId, imported.getId());
        assertNotEquals(originalRequestId, imported.getRequests().getFirst().getId());
    }

    @Test
    void rejectsUnsupportedFutureSchemaVersion() throws Exception {
        Path workspacePath = tempDir.resolve("future.json");
        Files.writeString(workspacePath, """
                {
                  "schemaVersion": 999,
                  "collections": [],
                  "environments": [],
                  "history": []
                }
                """);

        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> new WorkspaceStore(workspacePath).importWorkspace(workspacePath)
        );

        assertTrue(exception.getMessage().contains("newer than this app supports"));
    }
}
