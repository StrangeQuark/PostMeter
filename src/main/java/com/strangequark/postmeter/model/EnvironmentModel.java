package com.strangequark.postmeter.model;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class EnvironmentModel {
    private String id = UUID.randomUUID().toString();
    private String name = "New Environment";
    private List<KeyValuePair> variables = new ArrayList<>();

    public EnvironmentModel() {
    }

    public EnvironmentModel(String name) {
        this.name = name;
    }

    public static EnvironmentModel noEnvironment() {
        EnvironmentModel environment = new EnvironmentModel("No Environment");
        environment.setId("none");
        return environment;
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
        this.name = isBlank(name) ? "Untitled Environment" : name.trim();
    }

    public List<KeyValuePair> getVariables() {
        if (variables == null) {
            variables = new ArrayList<>();
        }
        return variables;
    }

    public void setVariables(List<KeyValuePair> variables) {
        this.variables = variables == null ? new ArrayList<>() : variables;
    }

    @Override
    public String toString() {
        return name;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
