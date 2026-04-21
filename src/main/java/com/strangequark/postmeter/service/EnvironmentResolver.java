package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.EnvironmentModel;
import com.strangequark.postmeter.model.KeyValuePair;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class EnvironmentResolver {
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{\\s*([A-Za-z0-9_.-]+)\\s*}}");

    public String resolve(String value, EnvironmentModel environment) {
        if (value == null || value.isEmpty() || environment == null) {
            return value == null ? "" : value;
        }

        Map<String, String> variables = new HashMap<>();
        for (KeyValuePair variable : environment.getVariables()) {
            if (variable.isEnabled() && variable.hasKey()) {
                variables.put(variable.getKey().trim(), variable.getValue());
            }
        }

        Matcher matcher = VARIABLE_PATTERN.matcher(value);
        StringBuilder resolved = new StringBuilder();
        while (matcher.find()) {
            String variableName = matcher.group(1);
            String replacement = variables.get(variableName);
            if (replacement == null) {
                matcher.appendReplacement(resolved, Matcher.quoteReplacement(matcher.group(0)));
            } else {
                matcher.appendReplacement(resolved, Matcher.quoteReplacement(replacement));
            }
        }
        matcher.appendTail(resolved);
        return resolved.toString();
    }
}
