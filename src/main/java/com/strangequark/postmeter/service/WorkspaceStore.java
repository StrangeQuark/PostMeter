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
import java.util.UUID;

public class WorkspaceStore {
    public static final String DATA_PATH_PROPERTY = "postmeter.data.path";
    public static final String DATA_PATH_ENV = "POSTMETER_DATA_PATH";

    private final Path workspacePath;
    private final ObjectMapper objectMapper;

    public WorkspaceStore() {
        this(defaultWorkspacePath());
    }

    public WorkspaceStore(Path workspacePath) {
        this.workspacePath = workspacePath;
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    public WorkspaceData load() throws IOException {
        if (!Files.exists(workspacePath)) {
            WorkspaceData defaults = defaultWorkspace();
            save(defaults);
            return defaults;
        }
        WorkspaceData workspace = objectMapper.readValue(workspacePath.toFile(), WorkspaceData.class);
        normalize(workspace);
        return workspace;
    }

    public void save(WorkspaceData workspace) throws IOException {
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

    private void normalize(WorkspaceData workspace) {
        if (workspace == null) {
            throw new IllegalArgumentException("Workspace data is required.");
        }
        workspace.setSchemaVersion(Math.max(workspace.getSchemaVersion(), 1));

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
}
