package com.strangequark.postmeter.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.strangequark.postmeter.model.BodyType;
import com.strangequark.postmeter.model.CollectionModel;
import com.strangequark.postmeter.model.KeyValuePair;
import com.strangequark.postmeter.model.RequestModel;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Iterator;

public class PostmanCollectionImporter {
    private final ObjectMapper objectMapper;

    public PostmanCollectionImporter() {
        this(new ObjectMapper());
    }

    public PostmanCollectionImporter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public CollectionModel importCollection(Path path) throws IOException {
        JsonNode root = objectMapper.readTree(path.toFile());
        if (!looksLikePostmanCollection(root)) {
            throw new IllegalArgumentException("File is not a supported Postman collection.");
        }

        CollectionModel collection = new CollectionModel(textAt(root, "/info/name", "Imported Postman Collection"));
        JsonNode items = root.path("item");
        if (items.isArray()) {
            importItems(items, collection);
        }
        if (collection.getRequests().isEmpty()) {
            throw new IllegalArgumentException("Postman collection does not contain importable requests.");
        }
        return collection;
    }

    private boolean looksLikePostmanCollection(JsonNode root) {
        return root != null
                && root.path("info").isObject()
                && root.path("item").isArray()
                && textAt(root, "/info/schema", "").contains("postman.com/json/collection");
    }

    private void importItems(JsonNode items, CollectionModel collection) {
        for (JsonNode item : items) {
            if (item.path("request").isObject()) {
                collection.getRequests().add(importRequest(item));
            }
            JsonNode childItems = item.path("item");
            if (childItems.isArray()) {
                importItems(childItems, collection);
            }
        }
    }

    private RequestModel importRequest(JsonNode item) {
        JsonNode requestNode = item.path("request");
        RequestModel request = new RequestModel(
                textAt(item, "/name", "Imported Request"),
                textAt(requestNode, "/method", "GET"),
                importUrl(requestNode.path("url"))
        );
        importHeaders(requestNode.path("header"), request);
        importBody(requestNode.path("body"), request);
        importQueryParams(requestNode.path("url").path("query"), request);
        return request;
    }

    private String importUrl(JsonNode urlNode) {
        if (urlNode.isTextual()) {
            return urlNode.asText();
        }
        String raw = textAt(urlNode, "/raw", "");
        if (!raw.isBlank()) {
            int queryStart = raw.indexOf('?');
            return queryStart >= 0 ? raw.substring(0, queryStart) : raw;
        }

        String protocol = textAt(urlNode, "/protocol", "https");
        String host = joinArray(urlNode.path("host"), ".");
        String path = joinArray(urlNode.path("path"), "/");
        StringBuilder url = new StringBuilder(protocol).append("://").append(host);
        if (!path.isBlank()) {
            url.append('/').append(path);
        }
        return url.toString();
    }

    private void importHeaders(JsonNode headers, RequestModel request) {
        if (!headers.isArray()) {
            return;
        }
        for (JsonNode header : headers) {
            String key = textAt(header, "/key", "");
            if (key.isBlank()) {
                continue;
            }
            KeyValuePair pair = new KeyValuePair(key, textAt(header, "/value", ""));
            pair.setEnabled(!header.path("disabled").asBoolean(false));
            request.getHeaders().add(pair);
        }
    }

    private void importQueryParams(JsonNode queryParams, RequestModel request) {
        if (!queryParams.isArray()) {
            return;
        }
        for (JsonNode queryParam : queryParams) {
            String key = textAt(queryParam, "/key", "");
            if (key.isBlank()) {
                continue;
            }
            KeyValuePair pair = new KeyValuePair(key, textAt(queryParam, "/value", ""));
            pair.setEnabled(!queryParam.path("disabled").asBoolean(false));
            request.getQueryParams().add(pair);
        }
    }

    private void importBody(JsonNode bodyNode, RequestModel request) {
        if (!bodyNode.isObject()) {
            return;
        }
        String mode = textAt(bodyNode, "/mode", "");
        if (!mode.equalsIgnoreCase("raw")) {
            return;
        }
        request.setBody(textAt(bodyNode, "/raw", ""));
        String language = textAt(bodyNode, "/options/raw/language", "");
        request.setBodyType(language.equalsIgnoreCase("json") ? BodyType.RAW_JSON : BodyType.RAW_TEXT);
    }

    private String joinArray(JsonNode array, String delimiter) {
        if (!array.isArray()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        Iterator<JsonNode> iterator = array.elements();
        while (iterator.hasNext()) {
            JsonNode value = iterator.next();
            if (builder.length() > 0) {
                builder.append(delimiter);
            }
            builder.append(value.asText());
        }
        return builder.toString();
    }

    private String textAt(JsonNode node, String pointer, String fallback) {
        JsonNode value = node.at(pointer);
        return value.isMissingNode() || value.isNull() ? fallback : value.asText(fallback);
    }
}
