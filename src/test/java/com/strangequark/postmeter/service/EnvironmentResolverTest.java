package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.EnvironmentModel;
import com.strangequark.postmeter.model.KeyValuePair;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EnvironmentResolverTest {
    private final EnvironmentResolver resolver = new EnvironmentResolver();

    @Test
    void resolvesKnownVariablesAndLeavesUnknownVariablesUntouched() {
        EnvironmentModel environment = new EnvironmentModel("Test");
        environment.getVariables().add(new KeyValuePair("baseUrl", "https://api.example.com"));
        environment.getVariables().add(new KeyValuePair("token", "abc123"));

        String resolved = resolver.resolve("{{baseUrl}}/v1/users?token={{ token }}&missing={{missing}}", environment);

        assertEquals("https://api.example.com/v1/users?token=abc123&missing={{missing}}", resolved);
    }
}
