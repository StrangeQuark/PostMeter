package com.strangequark.postmeter.model;

public enum BodyType {
    NONE("None"),
    RAW_JSON("Raw JSON"),
    RAW_TEXT("Raw Text");

    private final String label;

    BodyType(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    @Override
    public String toString() {
        return label;
    }
}
