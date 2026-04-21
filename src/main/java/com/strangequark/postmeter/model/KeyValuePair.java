package com.strangequark.postmeter.model;

public class KeyValuePair {
    private boolean enabled = true;
    private String key = "";
    private String value = "";

    public KeyValuePair() {
    }

    public KeyValuePair(String key, String value) {
        this(true, key, value);
    }

    public KeyValuePair(boolean enabled, String key, String value) {
        this.enabled = enabled;
        this.key = key == null ? "" : key;
        this.value = value == null ? "" : value;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key == null ? "" : key;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value == null ? "" : value;
    }

    public boolean hasKey() {
        return key != null && !key.trim().isEmpty();
    }
}
