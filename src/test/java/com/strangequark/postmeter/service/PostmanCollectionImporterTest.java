package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.BodyType;
import com.strangequark.postmeter.model.CollectionModel;
import com.strangequark.postmeter.model.RequestModel;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PostmanCollectionImporterTest {
    @TempDir
    Path tempDir;

    @Test
    void importsCommonPostmanCollectionFields() throws Exception {
        Path postmanFile = tempDir.resolve("postman.json");
        Files.writeString(postmanFile, """
                {
                  "info": {
                    "name": "Example API",
                    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
                  },
                  "item": [
                    {
                      "name": "Create Item",
                      "request": {
                        "method": "POST",
                        "header": [
                          {"key": "X-Test", "value": "yes"},
                          {"key": "X-Disabled", "value": "no", "disabled": true}
                        ],
                        "url": {
                          "raw": "https://api.example.com/items?team=core",
                          "query": [
                            {"key": "team", "value": "core"}
                          ]
                        },
                        "body": {
                          "mode": "raw",
                          "raw": "{\\"name\\":\\"one\\"}",
                          "options": {
                            "raw": {
                              "language": "json"
                            }
                          }
                        }
                      }
                    }
                  ]
                }
                """);

        CollectionModel collection = new WorkspaceStore(tempDir.resolve("workspace.json")).importCollection(postmanFile);
        RequestModel request = collection.getRequests().getFirst();

        assertEquals("Example API", collection.getName());
        assertEquals("Create Item", request.getName());
        assertEquals("POST", request.getMethod());
        assertEquals("https://api.example.com/items", request.getUrl());
        assertEquals("team", request.getQueryParams().getFirst().getKey());
        assertEquals("core", request.getQueryParams().getFirst().getValue());
        assertEquals("X-Test", request.getHeaders().getFirst().getKey());
        assertEquals("yes", request.getHeaders().getFirst().getValue());
        assertEquals(false, request.getHeaders().get(1).isEnabled());
        assertEquals(BodyType.RAW_JSON, request.getBodyType());
        assertEquals("{\"name\":\"one\"}", request.getBody());
    }
}
