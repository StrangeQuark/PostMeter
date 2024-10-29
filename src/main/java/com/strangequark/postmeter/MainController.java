package com.strangequark.postmeter;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

public class MainController {
    @FXML
    private BorderPane root; // Reference to the root BorderPane
    @FXML
    private SplitPane vertPane; // Reference to the vertical SplitPane
    @FXML
    private SplitPane horzPane; // Reference to the vertical SplitPane

    private boolean initialDividerSet = false; // Flag to ensure divider positions are set only once

    @FXML
    private VBox paramsContainer;

    @FXML
    private VBox headersContainer;

    @FXML
    private TreeView<String> collectionsTreeView;

    @FXML
    private ListView<String> environmentsList;

    @FXML
    private ListView<String> historyList;

    private static final String ROOT = System.getProperty("user.dir");
    private static final String COLLECTIONS_PATH = ROOT + "/src/main/resources/jsonFiles/collections.json";
    private static final String ENVIRONMENTS_PATH = ROOT + "/src/main/resources/jsonFiles/environments.json";
    private static final String HISTORY_PATH = ROOT + "/src/main/resources/jsonFiles/history.json";
    private ObjectMapper objectMapper = new ObjectMapper();

    @FXML
    public void initialize() {
        //Set the dividers positions on first load
        Platform.runLater(() -> {
            root.widthProperty().addListener((obs, oldVal, newVal) -> setDividerPositionsOnce());
            root.heightProperty().addListener((obs, oldVal, newVal) -> setDividerPositionsOnce());
        });
    }

    @FXML
    private void addParamRow() {
        addRow(paramsContainer);
    }

    @FXML
    private void addHeaderRow() {
        addRow(headersContainer);
    }

    @FXML
    private void showCollections() {
        clearVisibility();
        collectionsTreeView.setVisible(true);
        loadCollections(); // Method to populate the collections TreeView
    }

    @FXML
    private void showEnvironments() {
        clearVisibility();
        environmentsList.setVisible(true);
        loadEnvironments(); // Method to populate the environments ListView
    }

    @FXML
    private void showHistory() {
        clearVisibility();
        historyList.setVisible(true);
        loadHistory(); // Method to populate the history ListView
    }

    private void clearVisibility() {
        collectionsTreeView.setVisible(false);
        environmentsList.setVisible(false);
        historyList.setVisible(false);
    }

    @FXML
    private void addCollection() {
        TreeItem<String> newCollection = new TreeItem<>("New Collection");
        collectionsTreeView.getRoot().getChildren().add(newCollection);
    }

    private void addCollectionChild(TreeItem<String> parent) {
        TreeItem<String> newChild = new TreeItem<>("New Child");
        parent.getChildren().add(newChild);
    }

    private void duplicateCollection(TreeItem<String> item) {
        if (item != null) {
            // Create a new TreeItem with the same name, modifying it to indicate it's a duplicate
            String originalName = item.getValue();
            TreeItem<String> newDuplicate = new TreeItem<>(originalName + " (Copy)");

            // Add the new duplicate to the parent of the original item
            TreeItem<String> parent = item.getParent();
            if (parent != null) {
                parent.getChildren().add(newDuplicate);
            }
        }
    }

    private void deleteCollection(TreeItem<String> item) {
        TreeItem<String> parent = item.getParent();
        if (parent != null) {
            parent.getChildren().remove(item);
        }
    }

    @FXML
    private void importCollection() {
        // Placeholder for import functionality - you can replace this with file selection dialog logic
        TreeItem<String> importedCollection = new TreeItem<>("Imported Collection");
        collectionsTreeView.getRoot().getChildren().add(importedCollection);
    }

    private void loadCollections() {
        try {
            Map<String, List<Map<String, String>>> data = objectMapper.readValue(new File(COLLECTIONS_PATH), Map.class);
            TreeItem<String> root = new TreeItem<>("Hidden root");

            data.get("collections").forEach(item -> {
                String collectionName = item.get("name");
                TreeItem<String> collectionItem = new TreeItem<>(collectionName);
                root.getChildren().add(collectionItem);
            });

            collectionsTreeView.setRoot(root);
            collectionsTreeView.setShowRoot(false);

            // Set a custom cell factory to add the context menu on each cell
            collectionsTreeView.setCellFactory(tv -> {
                TreeCell<String> cell = new TreeCell<>() {
                    @Override
                    protected void updateItem(String item, boolean empty) {
                        super.updateItem(item, empty);
                        setText(empty ? null : item);
                    }
                };

                // Create and set up the context menu
                ContextMenu contextMenu = new ContextMenu();
                MenuItem addMenuItem = new MenuItem("Add");
                MenuItem duplicateMenuItem = new MenuItem("Duplicate"); // Changed to "Duplicate"
                MenuItem deleteMenuItem = new MenuItem("Delete");

                addMenuItem.setOnAction(event -> addCollectionChild(cell.getTreeItem()));
                duplicateMenuItem.setOnAction(event -> duplicateCollection(cell.getTreeItem())); // Implementing duplicate functionality
                deleteMenuItem.setOnAction(event -> deleteCollection(cell.getTreeItem()));

                contextMenu.getItems().addAll(addMenuItem, duplicateMenuItem, deleteMenuItem);

                // Show context menu on right-click only for top-level collections
                cell.setOnContextMenuRequested(event -> {
                    TreeItem<String> selectedItem = cell.getTreeItem();
                    if (selectedItem != null && selectedItem.getParent() == collectionsTreeView.getRoot()) {
                        contextMenu.show(cell, event.getScreenX(), event.getScreenY());
                    } else if (selectedItem != null) {
                        contextMenu.getItems().remove(addMenuItem);
                        contextMenu.show(cell, event.getScreenX(), event.getScreenY());
                    } else {
                        contextMenu.hide();
                    }
                });

                return cell;
            });
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void loadEnvironments() {
        try {
            Map<String, List<Map<String, String>>> data = objectMapper.readValue(new File(ENVIRONMENTS_PATH), Map.class);
            environmentsList.getItems().clear();
            data.get("environments").forEach(item -> environmentsList.getItems().add(item.get("name")));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void loadHistory() {
        try {
            Map<String, List<Map<String, String>>> data = objectMapper.readValue(new File(HISTORY_PATH), Map.class);
            historyList.getItems().clear();
            data.get("history").forEach(item -> historyList.getItems().add(item.get("request")));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    // Utility method to create and add a new row with Key-Value TextFields and a Delete Button
    private void addRow(VBox container) {
        HBox row = new HBox(5);  // spacing between fields
        TextField keyField = new TextField();
        keyField.setPromptText("Key");
        TextField valueField = new TextField();
        valueField.setPromptText("Value");

        // Delete button to remove this row
        Button deleteButton = new Button("Delete");
        deleteButton.setOnAction(e -> container.getChildren().remove(row));

        row.getChildren().addAll(keyField, valueField, deleteButton);
        container.getChildren().add(row);
    }

    private void setDividerPositionsOnce() {
        if (!initialDividerSet) {
            vertPane.setDividerPositions(0.75); // Preferred vertical divider position
            horzPane.setDividerPositions(0.15); // Preferred horizontal divider position
            initialDividerSet = true; // Prevent further adjustments
        }
    }
}

