package com.strangequark.postmeter.model;

import java.util.ArrayList;
import java.util.List;

public class WorkspaceData {
    private int schemaVersion = 1;
    private List<CollectionModel> collections = new ArrayList<>();
    private List<EnvironmentModel> environments = new ArrayList<>();
    private List<HistoryEntry> history = new ArrayList<>();

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public List<CollectionModel> getCollections() {
        if (collections == null) {
            collections = new ArrayList<>();
        }
        return collections;
    }

    public void setCollections(List<CollectionModel> collections) {
        this.collections = collections == null ? new ArrayList<>() : collections;
    }

    public List<EnvironmentModel> getEnvironments() {
        if (environments == null) {
            environments = new ArrayList<>();
        }
        return environments;
    }

    public void setEnvironments(List<EnvironmentModel> environments) {
        this.environments = environments == null ? new ArrayList<>() : environments;
    }

    public List<HistoryEntry> getHistory() {
        if (history == null) {
            history = new ArrayList<>();
        }
        return history;
    }

    public void setHistory(List<HistoryEntry> history) {
        this.history = history == null ? new ArrayList<>() : history;
    }
}
