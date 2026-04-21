package com.strangequark.postmeter.model;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class CollectionModel {
    private String id = UUID.randomUUID().toString();
    private String name = "New Collection";
    private String description = "";
    private List<RequestModel> requests = new ArrayList<>();

    public CollectionModel() {
    }

    public CollectionModel(String name) {
        this.name = name;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = isBlank(id) ? UUID.randomUUID().toString() : id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = isBlank(name) ? "Untitled Collection" : name.trim();
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description == null ? "" : description;
    }

    public List<RequestModel> getRequests() {
        if (requests == null) {
            requests = new ArrayList<>();
        }
        return requests;
    }

    public void setRequests(List<RequestModel> requests) {
        this.requests = requests == null ? new ArrayList<>() : requests;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
