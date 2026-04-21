package com.strangequark.postmeter.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.strangequark.postmeter.model.CollectionModel;
import com.strangequark.postmeter.model.EnvironmentModel;
import com.strangequark.postmeter.model.KeyValuePair;
import com.strangequark.postmeter.model.RequestModel;
import com.strangequark.postmeter.model.WorkspaceData;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

public class WorkspaceStore {
    public static final int CURRENT_SCHEMA_VERSION = 2;
    public static final int MIN_SUPPORTED_SCHEMA_VERSION = 1;
    public static final String DATA_PATH_PROPERTY = "postmeter.data.path";
    public static final String DATA_PATH_ENV = "POSTMETER_DATA_PATH";

    private final Path workspacePath;
    private final ObjectMapper objectMapper;
    private final PostmanCollectionImporter postmanCollectionImporter;

    public WorkspaceStore() {
        this(defaultWorkspacePath());
    }

    public WorkspaceStore(Path workspacePath) {
        this.workspacePath = workspacePath;
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
        this.postmanCollectionImporter = new PostmanCollectionImporter(objectMapper);
    }

    public WorkspaceData load() throws IOException {
        if (!Files.exists(workspacePath)) {
            WorkspaceData defaults = defaultWorkspace();
            save(defaults);
            return defaults;
        }

        WorkspaceData workspace;
        try {
            workspace = objectMapper.readValue(workspacePath.toFile(), WorkspaceData.class);
        } catch (IOException | RuntimeException e) {
            Path recoveredPath = quarantineCorruptWorkspace();
            WorkspaceData recoveredWorkspace = defaultWorkspace();
            save(recoveredWorkspace);
            throw new WorkspaceRecoveryException(
                    "Workspace file could not be read. A fresh workspace was created and the unreadable file was moved to "
                            + recoveredPath + ".",
                    recoveredWorkspace,
                    recoveredPath,
                    e
            );
        }

        boolean migrated = migrate(workspace);
        normalize(workspace);
        if (migrated) {
            createBackup("pre-migration");
            save(workspace);
        }
        return workspace;
    }

    public void save(WorkspaceData workspace) throws IOException {
        workspace.setSchemaVersion(CURRENT_SCHEMA_VERSION);
        normalize(workspace);
        Path parent = workspacePath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        Path tempFile = parent == null
                ? Files.createTempFile("postmeter-workspace", ".json.tmp")
                : Files.createTempFile(parent, "postmeter-workspace", ".json.tmp");
        try {
            objectMapper.writeValue(tempFile.toFile(), workspace);
            try {
                Files.move(tempFile, workspacePath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tempFile, workspacePath, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(tempFile);
        }
    }

    public void exportWorkspace(WorkspaceData workspace, Path exportPath) throws IOException {
        if (workspace == null) {
            throw new IllegalArgumentException("Workspace data is required.");
        }
        writeJson(exportPath, workspace);
    }

    public WorkspaceData importWorkspace(Path importPath) throws IOException {
        return readWorkspace(importPath);
    }

    public void exportCollection(CollectionModel collection, Path exportPath) throws IOException {
        if (collection == null) {
            throw new IllegalArgumentException("Collection is required.");
        }
        WorkspaceData singleCollectionWorkspace = new WorkspaceData();
        singleCollectionWorkspace.getCollections().add(collection);
        writeJson(exportPath, singleCollectionWorkspace);
    }

    public CollectionModel importCollection(Path importPath) throws IOException {
        CollectionModel collection;
        try {
            WorkspaceData imported = importWorkspace(importPath);
            if (imported.getCollections().isEmpty()) {
                throw new IllegalArgumentException("Imported file does not contain any collections.");
            }
            collection = imported.getCollections().getFirst();
        } catch (IOException | RuntimeException nativeImportFailure) {
            try {
                collection = postmanCollectionImporter.importCollection(importPath);
            } catch (IOException | RuntimeException postmanImportFailure) {
                IllegalArgumentException unsupported = new IllegalArgumentException(
                        "File is not a supported PostMeter or Postman collection."
                );
                unsupported.addSuppressed(nativeImportFailure);
                unsupported.addSuppressed(postmanImportFailure);
                throw unsupported;
            }
        }
        collection.setId(UUID.randomUUID().toString());
        for (RequestModel request : collection.getRequests()) {
            request.setId(UUID.randomUUID().toString());
        }
        return collection;
    }

    public Path getWorkspacePath() {
        return workspacePath;
    }

    public static Path defaultWorkspacePath() {
        String configuredPath = System.getProperty(DATA_PATH_PROPERTY);
        if (configuredPath != null && !configuredPath.isBlank()) {
            return Path.of(configuredPath);
        }
        configuredPath = System.getenv(DATA_PATH_ENV);
        if (configuredPath != null && !configuredPath.isBlank()) {
            return Path.of(configuredPath);
        }
        return Path.of(System.getProperty("user.home"), ".postmeter", "workspace.json");
    }

    public static WorkspaceData defaultWorkspace() {
        WorkspaceData workspace = new WorkspaceData();
        workspace.setSchemaVersion(CURRENT_SCHEMA_VERSION);
        CollectionModel collection = new CollectionModel("Getting Started");

        RequestModel sampleRequest = new RequestModel("Echo GET", "GET", "https://postman-echo.com/get");
        sampleRequest.getQueryParams().add(new KeyValuePair("source", "postmeter"));
        sampleRequest.getHeaders().add(new KeyValuePair("Accept", "application/json"));
        collection.getRequests().add(sampleRequest);

        EnvironmentModel environment = new EnvironmentModel("Local Example");
        environment.getVariables().add(new KeyValuePair("baseUrl", "https://postman-echo.com"));

        workspace.getCollections().add(collection);
        workspace.getEnvironments().add(environment);
        return workspace;
    }

    private WorkspaceData readWorkspace(Path path) throws IOException {
        WorkspaceData workspace = objectMapper.readValue(path.toFile(), WorkspaceData.class);
        migrate(workspace);
        normalize(workspace);
        return workspace;
    }

    private boolean migrate(WorkspaceData workspace) {
        if (workspace == null) {
            throw new IllegalArgumentException("Workspace data is required.");
        }
        int schemaVersion = workspace.getSchemaVersion();
        if (schemaVersion > CURRENT_SCHEMA_VERSION) {
            throw new IllegalArgumentException("Workspace schema version " + schemaVersion
                    + " is newer than this app supports (" + CURRENT_SCHEMA_VERSION + ").");
        }
        if (schemaVersion < MIN_SUPPORTED_SCHEMA_VERSION) {
            throw new IllegalArgumentException("Workspace schema version " + schemaVersion + " is not supported.");
        }

        boolean migrated = false;
        if (schemaVersion < 2) {
            workspace.setSchemaVersion(2);
            migrated = true;
        }
        return migrated;
    }

    private void normalize(WorkspaceData workspace) {
        if (workspace == null) {
            throw new IllegalArgumentException("Workspace data is required.");
        }
        workspace.setSchemaVersion(CURRENT_SCHEMA_VERSION);

        if (workspace.getCollections().isEmpty()) {
            workspace.getCollections().addAll(defaultWorkspace().getCollections());
        }

        for (CollectionModel collection : workspace.getCollections()) {
            ensureId(collection);
            collection.setName(collection.getName());
            for (RequestModel request : collection.getRequests()) {
                ensureId(request);
                request.setName(request.getName());
                request.setMethod(request.getMethod());
                request.setUrl(request.getUrl());
                request.getQueryParams();
                request.getHeaders();
                request.setBodyType(request.getBodyType());
                request.setBody(request.getBody());
            }
        }

        for (EnvironmentModel environment : workspace.getEnvironments()) {
            ensureId(environment);
            environment.setName(environment.getName());
            environment.getVariables();
        }
    }

    private void writeJson(Path targetPath, WorkspaceData workspace) throws IOException {
        workspace.setSchemaVersion(CURRENT_SCHEMA_VERSION);
        normalize(workspace);
        Path parent = targetPath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        objectMapper.writeValue(targetPath.toFile(), workspace);
    }

    private Path createBackup(String reason) throws IOException {
        if (!Files.exists(workspacePath)) {
            return null;
        }
        Path backupPath = siblingPath(reason + ".backup");
        Files.copy(workspacePath, backupPath, StandardCopyOption.REPLACE_EXISTING);
        return backupPath;
    }

    private Path quarantineCorruptWorkspace() throws IOException {
        Path recoveredPath = siblingPath("corrupt");
        try {
            Files.move(workspacePath, recoveredPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(workspacePath, recoveredPath, StandardCopyOption.REPLACE_EXISTING);
        }
        return recoveredPath;
    }

    private Path siblingPath(String label) {
        String filename = workspacePath.getFileName() == null ? "workspace.json" : workspacePath.getFileName().toString();
        String timestamp = DateTimeFormatter.ISO_INSTANT.format(Instant.now()).replace(':', '-');
        Path parent = workspacePath.getParent();
        Path backupName = Path.of(filename + "." + label + "." + timestamp);
        return parent == null ? backupName : parent.resolve(backupName);
    }

    private void ensureId(CollectionModel collection) {
        if (collection.getId() == null || collection.getId().isBlank()) {
            collection.setId(UUID.randomUUID().toString());
        }
    }

    private void ensureId(RequestModel request) {
        if (request.getId() == null || request.getId().isBlank()) {
            request.setId(UUID.randomUUID().toString());
        }
    }

    private void ensureId(EnvironmentModel environment) {
        if (environment.getId() == null || environment.getId().isBlank()) {
            environment.setId(UUID.randomUUID().toString());
        }
    }

    public static class WorkspaceRecoveryException extends IOException {
        private final WorkspaceData recoveredWorkspace;
        private final Path recoveredPath;

        public WorkspaceRecoveryException(
                String message,
                WorkspaceData recoveredWorkspace,
                Path recoveredPath,
                Throwable cause
        ) {
            super(message, cause);
            this.recoveredWorkspace = recoveredWorkspace;
            this.recoveredPath = recoveredPath;
        }

        public WorkspaceData getRecoveredWorkspace() {
            return recoveredWorkspace;
        }

        public Path getRecoveredPath() {
            return recoveredPath;
        }
    }
}
