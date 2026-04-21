package com.strangequark.postmeter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.strangequark.postmeter.model.BodyType;
import com.strangequark.postmeter.model.CollectionModel;
import com.strangequark.postmeter.model.EnvironmentModel;
import com.strangequark.postmeter.model.HistoryEntry;
import com.strangequark.postmeter.model.HttpExchangeResult;
import com.strangequark.postmeter.model.KeyValuePair;
import com.strangequark.postmeter.model.LoadTestCancellationToken;
import com.strangequark.postmeter.model.LoadTestConfig;
import com.strangequark.postmeter.model.LoadTestResult;
import com.strangequark.postmeter.model.RequestModel;
import com.strangequark.postmeter.model.WorkspaceData;
import com.strangequark.postmeter.service.HttpRequestExecutor;
import com.strangequark.postmeter.service.LoadTestRunner;
import com.strangequark.postmeter.service.WorkspaceStore;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.layout.BorderPane;
import javafx.scene.control.cell.TextFieldTableCell;
import javafx.stage.FileChooser;
import javafx.stage.Window;
import javafx.util.StringConverter;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

public class MainController {
    private static final List<String> METHODS = List.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS");
    private static final int MAX_HISTORY_ITEMS = 100;
    private static final DateTimeFormatter HISTORY_TIME_FORMAT = DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.systemDefault());

    @FXML
    private BorderPane root;
    @FXML
    private SplitPane mainSplitPane;
    @FXML
    private SplitPane workSplitPane;
    @FXML
    private TreeView<WorkspaceNode> collectionsTreeView;
    @FXML
    private ListView<HistoryEntry> historyListView;
    @FXML
    private ComboBox<EnvironmentModel> environmentComboBox;
    @FXML
    private TextField environmentNameField;
    @FXML
    private TableView<KeyValuePair> environmentTable;
    @FXML
    private TextField requestNameField;
    @FXML
    private ChoiceBox<String> methodChoice;
    @FXML
    private TextField urlField;
    @FXML
    private TableView<KeyValuePair> paramsTable;
    @FXML
    private TableView<KeyValuePair> headersTable;
    @FXML
    private ChoiceBox<BodyType> bodyTypeChoice;
    @FXML
    private TextArea bodyTextArea;
    @FXML
    private Label responseStatusLabel;
    @FXML
    private Label responseTimeLabel;
    @FXML
    private Label responseSizeLabel;
    @FXML
    private Label finalUrlLabel;
    @FXML
    private TextArea responseBodyArea;
    @FXML
    private TextArea responseHeadersArea;
    @FXML
    private Spinner<Integer> concurrencySpinner;
    @FXML
    private Spinner<Integer> requestCountSpinner;
    @FXML
    private TextArea loadResultsArea;
    @FXML
    private Label statusLabel;
    @FXML
    private Label dataPathLabel;
    @FXML
    private Button sendButton;
    @FXML
    private Button runLoadTestButton;
    @FXML
    private Button cancelLoadTestButton;
    @FXML
    private Label validationLabel;

    private final WorkspaceStore workspaceStore = new WorkspaceStore();
    private final HttpRequestExecutor requestExecutor = new HttpRequestExecutor();
    private final LoadTestRunner loadTestRunner = new LoadTestRunner(requestExecutor);
    private final ObjectMapper objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    private final ObservableList<KeyValuePair> params = FXCollections.observableArrayList();
    private final ObservableList<KeyValuePair> headers = FXCollections.observableArrayList();
    private final ObservableList<KeyValuePair> environmentVariables = FXCollections.observableArrayList();

    private WorkspaceData workspace;
    private RequestModel activeRequest;
    private CollectionModel activeCollection;
    private LoadTestCancellationToken activeLoadTestCancellation;
    private CompletableFuture<LoadTestResult> activeLoadTestFuture;
    private boolean loadingSelection;

    @FXML
    public void initialize() {
        configureTables();
        configureCollectionsTree();
        configureHistory();
        configureEnvironments();
        configureRequestEditor();
        configureLoadTestControls();

        try {
            workspace = workspaceStore.load();
            refreshWorkspaceViews();
            selectFirstRequest();
            setStatus("Workspace loaded.");
        } catch (WorkspaceStore.WorkspaceRecoveryException e) {
            workspace = e.getRecoveredWorkspace();
            refreshWorkspaceViews();
            selectFirstRequest();
            showError("Workspace Recovered", e.getMessage());
        } catch (IOException | RuntimeException e) {
            workspace = WorkspaceStore.defaultWorkspace();
            refreshWorkspaceViews();
            selectFirstRequest();
            showError("Workspace Error", "Could not load workspace: " + e.getMessage());
        }

        dataPathLabel.setText(workspaceStore.getWorkspacePath().toString());
        Platform.runLater(() -> {
            mainSplitPane.setDividerPositions(0.24);
            workSplitPane.setDividerPositions(0.56);
        });
    }

    @FXML
    private void handleNewCollection() {
        CollectionModel collection = new CollectionModel(uniqueName("New Collection", workspace.getCollections().stream()
                .map(CollectionModel::getName)
                .toList()));
        RequestModel request = new RequestModel("New Request", "GET", "");
        collection.getRequests().add(request);
        workspace.getCollections().add(collection);
        refreshCollectionsTree();
        selectRequest(request.getId());
        saveWorkspace("Collection created.");
    }

    @FXML
    private void handleNewRequest() {
        CollectionModel collection = activeCollection;
        if (collection == null && !workspace.getCollections().isEmpty()) {
            collection = workspace.getCollections().getFirst();
        }
        if (collection == null) {
            handleNewCollection();
            return;
        }

        RequestModel request = new RequestModel(uniqueName("New Request", collection.getRequests().stream()
                .map(RequestModel::getName)
                .toList()), "GET", "");
        collection.getRequests().add(request);
        refreshCollectionsTree();
        selectRequest(request.getId());
        saveWorkspace("Request created.");
    }

    @FXML
    private void handleDeleteSelected() {
        TreeItem<WorkspaceNode> selected = collectionsTreeView.getSelectionModel().getSelectedItem();
        if (selected == null || selected.getValue() == null) {
            setStatus("Select a collection or request to delete.");
            return;
        }
        if (!confirm("Delete Selection", "Delete " + selected.getValue().displayName() + "?")) {
            return;
        }

        WorkspaceNode node = selected.getValue();
        deleteNode(node);
    }

    @FXML
    private void handleSave() {
        if (activeRequest != null) {
            collectRequestFromEditor(activeRequest);
        }
        collectEnvironmentFromEditor();
        saveWorkspace("Workspace saved.");
        refreshWorkspaceViews();
        if (activeRequest != null) {
            selectRequest(activeRequest.getId());
        }
    }

    @FXML
    private void handleImportWorkspace() {
        File file = workspaceFileChooser("Import PostMeter Workspace").showOpenDialog(ownerWindow());
        if (file == null) {
            return;
        }
        if (!confirm("Replace Workspace", "Importing a workspace replaces the current workspace. Continue?")) {
            return;
        }

        try {
            WorkspaceData imported = workspaceStore.importWorkspace(file.toPath());
            workspace = imported;
            activeCollection = null;
            activeRequest = null;
            workspaceStore.save(workspace);
            refreshWorkspaceViews();
            selectFirstRequest();
            setStatus("Workspace imported.");
        } catch (IOException | RuntimeException e) {
            showError("Import Failed", "Could not import workspace: " + rootMessage(e));
        }
    }

    @FXML
    private void handleExportWorkspace() {
        if (activeRequest != null) {
            collectRequestFromEditor(activeRequest);
        }
        collectEnvironmentFromEditor();

        File file = workspaceFileChooser("Export PostMeter Workspace").showSaveDialog(ownerWindow());
        if (file == null) {
            return;
        }

        try {
            workspaceStore.exportWorkspace(workspace, file.toPath());
            setStatus("Workspace exported to " + file.toPath() + ".");
        } catch (IOException | RuntimeException e) {
            showError("Export Failed", "Could not export workspace: " + rootMessage(e));
        }
    }

    @FXML
    private void handleImportCollection() {
        File file = workspaceFileChooser("Import PostMeter Collection").showOpenDialog(ownerWindow());
        if (file == null) {
            return;
        }

        try {
            CollectionModel imported = workspaceStore.importCollection(file.toPath());
            imported.setName(uniqueName(imported.getName(), workspace.getCollections().stream()
                    .map(CollectionModel::getName)
                    .toList()));
            workspace.getCollections().add(imported);
            refreshCollectionsTree();
            if (!imported.getRequests().isEmpty()) {
                selectRequest(imported.getRequests().getFirst().getId());
            }
            saveWorkspace("Collection imported.");
        } catch (IOException | RuntimeException e) {
            showError("Import Failed", "Could not import collection: " + rootMessage(e));
        }
    }

    @FXML
    private void handleExportSelectedCollection() {
        CollectionModel collection = selectedCollection();
        if (collection == null) {
            setStatus("Select a collection to export.");
            return;
        }

        FileChooser fileChooser = workspaceFileChooser("Export PostMeter Collection");
        fileChooser.setInitialFileName(safeFilename(collection.getName()) + ".postmeter.json");
        File file = fileChooser.showSaveDialog(ownerWindow());
        if (file == null) {
            return;
        }

        try {
            workspaceStore.exportCollection(collection, file.toPath());
            setStatus("Collection exported to " + file.toPath() + ".");
        } catch (IOException | RuntimeException e) {
            showError("Export Failed", "Could not export collection: " + rootMessage(e));
        }
    }

    @FXML
    private void handleSend() {
        if (activeRequest == null) {
            setStatus("Create or select a request before sending.");
            return;
        }

        collectRequestFromEditor(activeRequest);
        collectEnvironmentFromEditor();
        RequestModel requestToSend = copyRequest(activeRequest);
        EnvironmentModel environment = activeEnvironment();
        if (!validateRequestForExecution(requestToSend, environment)) {
            return;
        }

        sendButton.setDisable(true);
        clearResponse();
        setStatus("Sending request...");

        requestExecutor.sendAsync(requestToSend, environment).whenComplete((result, error) -> Platform.runLater(() -> {
            sendButton.setDisable(false);
            if (error != null) {
                String message = rootMessage(error);
                showRequestError(message);
                workspace.getHistory().add(0, new HistoryEntry(requestToSend.getMethod(), requestToSend.getUrl(), 0, 0L));
                trimHistory();
                refreshHistory();
                saveWorkspace("Request failed.");
                return;
            }

            displayResponse(result);
            workspace.getHistory().add(0, new HistoryEntry(
                    requestToSend.getMethod(),
                    result.getFinalUrl(),
                    result.getStatusCode(),
                    result.getDurationMillis()
            ));
            trimHistory();
            refreshHistory();
            saveWorkspace("Request completed.");
        }));
    }

    @FXML
    private void handleAddParam() {
        params.add(new KeyValuePair());
    }

    @FXML
    private void handleRemoveParam() {
        removeSelected(paramsTable, params);
    }

    @FXML
    private void handleAddHeader() {
        headers.add(new KeyValuePair());
    }

    @FXML
    private void handleRemoveHeader() {
        removeSelected(headersTable, headers);
    }

    @FXML
    private void handleNewEnvironment() {
        EnvironmentModel environment = new EnvironmentModel(uniqueName("New Environment", workspace.getEnvironments().stream()
                .map(EnvironmentModel::getName)
                .toList()));
        environment.getVariables().add(new KeyValuePair("baseUrl", "https://example.com"));
        workspace.getEnvironments().add(environment);
        refreshEnvironmentCombo();
        environmentComboBox.getSelectionModel().select(environment);
        saveWorkspace("Environment created.");
    }

    @FXML
    private void handleDeleteEnvironment() {
        EnvironmentModel environment = environmentComboBox.getSelectionModel().getSelectedItem();
        if (environment == null || isNoEnvironment(environment)) {
            setStatus("Select an environment to delete.");
            return;
        }
        workspace.getEnvironments().remove(environment);
        refreshEnvironmentCombo();
        saveWorkspace("Environment deleted.");
    }

    @FXML
    private void handleAddEnvironmentVariable() {
        environmentVariables.add(new KeyValuePair());
    }

    @FXML
    private void handleRemoveEnvironmentVariable() {
        removeSelected(environmentTable, environmentVariables);
    }

    @FXML
    private void handleRunLoadTest() {
        if (activeRequest == null) {
            setStatus("Create or select a request before running a load test.");
            return;
        }

        collectRequestFromEditor(activeRequest);
        collectEnvironmentFromEditor();
        RequestModel requestToSend = copyRequest(activeRequest);
        EnvironmentModel environment = activeEnvironment();
        if (!validateRequestForExecution(requestToSend, environment)) {
            return;
        }
        LoadTestConfig config;
        try {
            config = new LoadTestConfig(concurrencySpinner.getValue(), requestCountSpinner.getValue());
        } catch (IllegalArgumentException e) {
            showError("Invalid Load Test", e.getMessage());
            return;
        }

        runLoadTestButton.setDisable(true);
        cancelLoadTestButton.setDisable(false);
        activeLoadTestCancellation = new LoadTestCancellationToken();
        loadResultsArea.setText("Running " + config.getTotalRequests() + " requests with concurrency "
                + config.getConcurrency() + "...\n");
        setStatus("Running load test...");

        activeLoadTestFuture = CompletableFuture
                .supplyAsync(() -> loadTestRunner.run(
                        requestToSend,
                        environment,
                        config,
                        activeLoadTestCancellation,
                        progress -> Platform.runLater(() -> updateLoadProgress(progress.getCompletedRequests(), progress.getRequestedRequests()))
                ))
                .whenComplete((result, error) -> Platform.runLater(() -> {
                    runLoadTestButton.setDisable(false);
                    cancelLoadTestButton.setDisable(true);
                    activeLoadTestCancellation = null;
                    activeLoadTestFuture = null;
                    if (error != null) {
                        loadResultsArea.setText("Load test failed:\n" + rootMessage(error));
                        setStatus("Load test failed.");
                        return;
                    }
                    loadResultsArea.setText(formatLoadTestResult(result));
                    setStatus(result.isCancelled() ? "Load test cancelled." : "Load test completed.");
                }));
    }

    @FXML
    private void handleCancelLoadTest() {
        if (activeLoadTestCancellation != null) {
            activeLoadTestCancellation.cancel();
            cancelLoadTestButton.setDisable(true);
            setStatus("Cancelling load test...");
        }
    }

    private void configureTables() {
        paramsTable.setItems(params);
        headersTable.setItems(headers);
        environmentTable.setItems(environmentVariables);
        configureKeyValueTable(paramsTable, "Parameter");
        configureKeyValueTable(headersTable, "Header");
        configureKeyValueTable(environmentTable, "Variable");
    }

    private void configureKeyValueTable(TableView<KeyValuePair> table, String keyLabel) {
        table.setEditable(true);

        TableColumn<KeyValuePair, String> keyColumn = new TableColumn<>(keyLabel);
        keyColumn.setCellValueFactory(cell -> new SimpleStringProperty(cell.getValue().getKey()));
        keyColumn.setCellFactory(TextFieldTableCell.forTableColumn());
        keyColumn.setOnEditCommit(event -> event.getRowValue().setKey(event.getNewValue()));
        keyColumn.setPrefWidth(220);

        TableColumn<KeyValuePair, String> valueColumn = new TableColumn<>("Value");
        valueColumn.setCellValueFactory(cell -> new SimpleStringProperty(cell.getValue().getValue()));
        valueColumn.setCellFactory(TextFieldTableCell.forTableColumn());
        valueColumn.setOnEditCommit(event -> event.getRowValue().setValue(event.getNewValue()));
        valueColumn.setPrefWidth(360);

        table.getColumns().clear();
        table.getColumns().add(keyColumn);
        table.getColumns().add(valueColumn);
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_FLEX_LAST_COLUMN);
    }

    private void configureCollectionsTree() {
        collectionsTreeView.setShowRoot(false);
        collectionsTreeView.setCellFactory(treeView -> new TreeCell<>() {
            @Override
            protected void updateItem(WorkspaceNode item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setContextMenu(null);
                    return;
                }
                setText(item.displayName());
                setContextMenu(collectionsContextMenu(item));
            }
        });

        collectionsTreeView.getSelectionModel().selectedItemProperty().addListener((obs, oldItem, newItem) -> {
            if (loadingSelection || newItem == null || newItem.getValue() == null) {
                return;
            }
            if (activeRequest != null) {
                collectRequestFromEditor(activeRequest);
            }
            WorkspaceNode node = newItem.getValue();
            if (node.type == NodeType.COLLECTION) {
                activeCollection = node.collection;
                activeRequest = node.collection.getRequests().isEmpty() ? null : node.collection.getRequests().getFirst();
                if (activeRequest != null) {
                    loadRequestIntoEditor(activeCollection, activeRequest);
                }
            } else {
                loadRequestIntoEditor(node.collection, node.request);
            }
        });
    }

    private ContextMenu collectionsContextMenu(WorkspaceNode node) {
        ContextMenu contextMenu = new ContextMenu();
        if (node.type == NodeType.COLLECTION) {
            MenuItem newRequest = new MenuItem("Add Request");
            newRequest.setOnAction(event -> {
                activeCollection = node.collection;
                handleNewRequest();
            });

            MenuItem renameCollection = new MenuItem("Rename Collection");
            renameCollection.setOnAction(event -> renameCollection(node.collection));

            MenuItem exportCollection = new MenuItem("Export Collection");
            exportCollection.setOnAction(event -> {
                selectCollection(node.collection);
                handleExportSelectedCollection();
            });

            MenuItem deleteCollection = new MenuItem("Delete Collection");
            deleteCollection.setOnAction(event -> {
                if (confirm("Delete Collection", "Delete " + node.collection.getName() + "?")) {
                    deleteNode(node);
                }
            });

            contextMenu.getItems().addAll(newRequest, renameCollection, exportCollection, deleteCollection);
        } else if (node.type == NodeType.REQUEST) {
            MenuItem renameRequest = new MenuItem("Rename Request");
            renameRequest.setOnAction(event -> renameRequest(node.collection, node.request));

            MenuItem duplicateRequest = new MenuItem("Duplicate Request");
            duplicateRequest.setOnAction(event -> duplicateRequest(node.collection, node.request));

            MenuItem deleteRequest = new MenuItem("Delete Request");
            deleteRequest.setOnAction(event -> {
                if (confirm("Delete Request", "Delete " + node.request.getName() + "?")) {
                    deleteNode(node);
                }
            });

            contextMenu.getItems().addAll(renameRequest, duplicateRequest, deleteRequest);
        }
        return contextMenu;
    }

    private void configureHistory() {
        historyListView.setCellFactory(listView -> new ListCell<>() {
            @Override
            protected void updateItem(HistoryEntry item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    return;
                }
                setText(formatHistoryEntry(item));
            }
        });

        historyListView.getSelectionModel().selectedItemProperty().addListener((obs, oldEntry, entry) -> {
            if (entry == null) {
                return;
            }
            methodChoice.setValue(entry.getMethod());
            urlField.setText(entry.getUrl());
            requestNameField.setText(entry.getMethod() + " " + entry.getUrl());
        });
    }

    private void configureEnvironments() {
        environmentComboBox.setConverter(new StringConverter<>() {
            @Override
            public String toString(EnvironmentModel environment) {
                return environment == null ? "" : environment.getName();
            }

            @Override
            public EnvironmentModel fromString(String string) {
                return null;
            }
        });
        environmentComboBox.valueProperty().addListener((obs, oldEnvironment, newEnvironment) -> {
            collectEnvironmentFromEditor(oldEnvironment);
            loadEnvironmentIntoEditor(newEnvironment);
        });
        environmentNameField.textProperty().addListener((obs, oldName, newName) -> {
            EnvironmentModel environment = environmentComboBox.getSelectionModel().getSelectedItem();
            if (environment != null && !isNoEnvironment(environment)) {
                environment.setName(newName);
            }
        });
    }

    private void configureRequestEditor() {
        methodChoice.setItems(FXCollections.observableArrayList(METHODS));
        methodChoice.setValue("GET");
        bodyTypeChoice.setItems(FXCollections.observableArrayList(BodyType.values()));
        bodyTypeChoice.setValue(BodyType.NONE);
    }

    private void configureLoadTestControls() {
        concurrencySpinner.setValueFactory(new SpinnerValueFactory.IntegerSpinnerValueFactory(1, LoadTestConfig.MAX_CONCURRENCY, 5));
        requestCountSpinner.setValueFactory(new SpinnerValueFactory.IntegerSpinnerValueFactory(1, LoadTestConfig.MAX_TOTAL_REQUESTS, 25));
        concurrencySpinner.setEditable(true);
        requestCountSpinner.setEditable(true);
        cancelLoadTestButton.setDisable(true);
    }

    private void refreshWorkspaceViews() {
        refreshCollectionsTree();
        refreshEnvironmentCombo();
        refreshHistory();
    }

    private void refreshCollectionsTree() {
        TreeItem<WorkspaceNode> rootItem = new TreeItem<>(WorkspaceNode.root());
        for (CollectionModel collection : workspace.getCollections()) {
            TreeItem<WorkspaceNode> collectionItem = new TreeItem<>(WorkspaceNode.collection(collection));
            collectionItem.setExpanded(true);
            for (RequestModel request : collection.getRequests()) {
                collectionItem.getChildren().add(new TreeItem<>(WorkspaceNode.request(collection, request)));
            }
            rootItem.getChildren().add(collectionItem);
        }
        collectionsTreeView.setRoot(rootItem);
    }

    private void selectCollection(CollectionModel collection) {
        if (collection == null || collectionsTreeView.getRoot() == null) {
            return;
        }
        for (TreeItem<WorkspaceNode> item : collectionsTreeView.getRoot().getChildren()) {
            WorkspaceNode node = item.getValue();
            if (node != null && node.collection == collection) {
                collectionsTreeView.getSelectionModel().select(item);
                activeCollection = collection;
                return;
            }
        }
    }

    private void refreshEnvironmentCombo() {
        EnvironmentModel selected = environmentComboBox.getSelectionModel().getSelectedItem();
        List<EnvironmentModel> environments = new ArrayList<>();
        environments.add(EnvironmentModel.noEnvironment());
        environments.addAll(workspace.getEnvironments());
        environmentComboBox.setItems(FXCollections.observableArrayList(environments));

        if (selected != null) {
            Optional<EnvironmentModel> match = environments.stream()
                    .filter(environment -> Objects.equals(environment.getId(), selected.getId()))
                    .findFirst();
            if (match.isPresent()) {
                environmentComboBox.getSelectionModel().select(match.get());
                return;
            }
        }
        environmentComboBox.getSelectionModel().selectFirst();
    }

    private void refreshHistory() {
        historyListView.setItems(FXCollections.observableArrayList(workspace.getHistory()));
    }

    private void selectFirstRequest() {
        for (CollectionModel collection : workspace.getCollections()) {
            if (!collection.getRequests().isEmpty()) {
                selectRequest(collection.getRequests().getFirst().getId());
                return;
            }
        }
    }

    private void selectRequest(String requestId) {
        if (requestId == null || collectionsTreeView.getRoot() == null) {
            return;
        }
        TreeItem<WorkspaceNode> match = findTreeItem(collectionsTreeView.getRoot(), requestId);
        if (match == null) {
            return;
        }
        loadingSelection = true;
        collectionsTreeView.getSelectionModel().select(match);
        loadingSelection = false;
        loadRequestIntoEditor(match.getValue().collection, match.getValue().request);
    }

    private TreeItem<WorkspaceNode> findTreeItem(TreeItem<WorkspaceNode> item, String requestId) {
        WorkspaceNode node = item.getValue();
        if (node != null && node.request != null && Objects.equals(node.request.getId(), requestId)) {
            return item;
        }
        for (TreeItem<WorkspaceNode> child : item.getChildren()) {
            TreeItem<WorkspaceNode> match = findTreeItem(child, requestId);
            if (match != null) {
                return match;
            }
        }
        return null;
    }

    private void loadRequestIntoEditor(CollectionModel collection, RequestModel request) {
        activeCollection = collection;
        activeRequest = request;
        if (request == null) {
            requestNameField.clear();
            urlField.clear();
            params.clear();
            headers.clear();
            bodyTextArea.clear();
            bodyTypeChoice.setValue(BodyType.NONE);
            return;
        }

        loadingSelection = true;
        requestNameField.setText(request.getName());
        methodChoice.setValue(request.getMethod());
        urlField.setText(request.getUrl());
        params.setAll(copyPairs(request.getQueryParams()));
        headers.setAll(copyPairs(request.getHeaders()));
        bodyTypeChoice.setValue(request.getBodyType());
        bodyTextArea.setText(request.getBody());
        loadingSelection = false;
        setStatus("Editing " + request.getName() + ".");
    }

    private void loadEnvironmentIntoEditor(EnvironmentModel environment) {
        if (environment == null || isNoEnvironment(environment)) {
            environmentNameField.setText("");
            environmentNameField.setDisable(true);
            environmentTable.setDisable(true);
            environmentVariables.clear();
            return;
        }

        environmentNameField.setDisable(false);
        environmentTable.setDisable(false);
        environmentNameField.setText(environment.getName());
        environmentVariables.setAll(copyPairs(environment.getVariables()));
    }

    private void collectRequestFromEditor(RequestModel request) {
        if (request == null || loadingSelection) {
            return;
        }
        request.setName(requestNameField.getText());
        request.setMethod(methodChoice.getValue());
        request.setUrl(urlField.getText());
        request.setQueryParams(nonEmptyPairs(params));
        request.setHeaders(nonEmptyPairs(headers));
        request.setBodyType(bodyTypeChoice.getValue());
        request.setBody(bodyTextArea.getText());
    }

    private void collectEnvironmentFromEditor() {
        EnvironmentModel environment = environmentComboBox.getSelectionModel().getSelectedItem();
        collectEnvironmentFromEditor(environment);
    }

    private void collectEnvironmentFromEditor(EnvironmentModel environment) {
        if (environment == null || isNoEnvironment(environment)) {
            return;
        }
        environment.setName(environmentNameField.getText());
        environment.setVariables(nonEmptyPairs(environmentVariables));
    }

    private void saveWorkspace(String status) {
        try {
            workspaceStore.save(workspace);
            setStatus(status);
        } catch (IOException e) {
            showError("Save Failed", "Could not save workspace: " + e.getMessage());
        } catch (RuntimeException e) {
            showError("Save Failed", e.getMessage());
        }
    }

    private void deleteNode(WorkspaceNode node) {
        if (node.type == NodeType.COLLECTION) {
            workspace.getCollections().remove(node.collection);
            if (workspace.getCollections().isEmpty()) {
                workspace.getCollections().addAll(WorkspaceStore.defaultWorkspace().getCollections());
            }
            activeCollection = null;
            activeRequest = null;
        } else if (node.type == NodeType.REQUEST) {
            node.collection.getRequests().remove(node.request);
            if (node.collection.getRequests().isEmpty()) {
                node.collection.getRequests().add(new RequestModel("New Request", "GET", ""));
            }
            activeRequest = null;
        }

        refreshCollectionsTree();
        selectFirstRequest();
        saveWorkspace("Deleted selection.");
    }

    private void duplicateRequest(CollectionModel collection, RequestModel request) {
        if (collection == null || request == null) {
            return;
        }
        RequestModel duplicate = copyRequest(request);
        duplicate.setId("");
        duplicate.setName(uniqueName(request.getName() + " Copy", collection.getRequests().stream()
                .map(RequestModel::getName)
                .toList()));
        collection.getRequests().add(duplicate);
        refreshCollectionsTree();
        selectRequest(duplicate.getId());
        saveWorkspace("Request duplicated.");
    }

    private void renameCollection(CollectionModel collection) {
        if (collection == null) {
            return;
        }
        promptForName("Rename Collection", "Collection name", collection.getName()).ifPresent(newName -> {
            collection.setName(uniqueName(newName, workspace.getCollections().stream()
                    .filter(existing -> existing != collection)
                    .map(CollectionModel::getName)
                    .toList()));
            refreshCollectionsTree();
            selectCollection(collection);
            saveWorkspace("Collection renamed.");
        });
    }

    private void renameRequest(CollectionModel collection, RequestModel request) {
        if (collection == null || request == null) {
            return;
        }
        promptForName("Rename Request", "Request name", request.getName()).ifPresent(newName -> {
            request.setName(uniqueName(newName, collection.getRequests().stream()
                    .filter(existing -> existing != request)
                    .map(RequestModel::getName)
                    .toList()));
            refreshCollectionsTree();
            selectRequest(request.getId());
            saveWorkspace("Request renamed.");
        });
    }

    private CollectionModel selectedCollection() {
        TreeItem<WorkspaceNode> selected = collectionsTreeView.getSelectionModel().getSelectedItem();
        if (selected == null || selected.getValue() == null) {
            return activeCollection;
        }
        WorkspaceNode node = selected.getValue();
        return node.collection;
    }

    private FileChooser workspaceFileChooser(String title) {
        FileChooser fileChooser = new FileChooser();
        fileChooser.setTitle(title);
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("PostMeter JSON", "*.postmeter.json", "*.json"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("JSON", "*.json"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("All Files", "*.*"));
        return fileChooser;
    }

    private Window ownerWindow() {
        return root == null || root.getScene() == null ? null : root.getScene().getWindow();
    }

    private EnvironmentModel activeEnvironment() {
        EnvironmentModel environment = environmentComboBox.getSelectionModel().getSelectedItem();
        return isNoEnvironment(environment) ? null : environment;
    }

    private boolean validateRequestForExecution(RequestModel request, EnvironmentModel environment) {
        List<String> validationErrors = requestExecutor.validate(request, environment);
        if (validationErrors.isEmpty()) {
            validationLabel.setText("");
            return true;
        }
        String message = String.join(" ", validationErrors);
        validationLabel.setText(message);
        setStatus("Fix request validation errors.");
        return false;
    }

    private boolean isNoEnvironment(EnvironmentModel environment) {
        return environment == null || Objects.equals("none", environment.getId());
    }

    private void displayResponse(HttpExchangeResult result) {
        responseStatusLabel.setText(Integer.toString(result.getStatusCode()));
        responseTimeLabel.setText(result.getDurationMillis() + " ms");
        responseSizeLabel.setText(formatBytes(result.getResponseBytes()));
        finalUrlLabel.setText(result.getFinalUrl());
        responseHeadersArea.setText(formatHeaders(result.getHeaders()));
        responseBodyArea.setText(formatResponseBody(result));
    }

    private void showRequestError(String message) {
        responseStatusLabel.setText("ERR");
        responseTimeLabel.setText("-");
        responseSizeLabel.setText("-");
        finalUrlLabel.setText(urlField.getText());
        responseHeadersArea.clear();
        responseBodyArea.setText(message);
        setStatus("Request failed.");
    }

    private void clearResponse() {
        responseStatusLabel.setText("-");
        responseTimeLabel.setText("-");
        responseSizeLabel.setText("-");
        finalUrlLabel.setText("-");
        responseHeadersArea.clear();
        responseBodyArea.clear();
    }

    private String formatResponseBody(HttpExchangeResult result) {
        String body = result.getBody();
        if (body == null || body.isBlank()) {
            return "";
        }

        boolean looksJson = body.trim().startsWith("{") || body.trim().startsWith("[");
        boolean headerSaysJson = result.getHeaders().entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("content-type"))
                .flatMap(entry -> entry.getValue().stream())
                .anyMatch(value -> value.toLowerCase().contains("json"));

        if (!looksJson && !headerSaysJson) {
            return body;
        }

        try {
            return objectMapper.writeValueAsString(objectMapper.readTree(body));
        } catch (JsonProcessingException e) {
            return body;
        }
    }

    private String formatHeaders(Map<String, List<String>> headers) {
        if (headers == null || headers.isEmpty()) {
            return "";
        }
        return headers.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(String.CASE_INSENSITIVE_ORDER))
                .map(entry -> entry.getKey() + ": " + String.join(", ", entry.getValue()))
                .collect(Collectors.joining("\n"));
    }

    private String formatLoadTestResult(LoadTestResult result) {
        StringBuilder builder = new StringBuilder();
        builder.append("Requested requests: ").append(result.getRequestedRequests()).append('\n');
        builder.append("Completed requests: ").append(result.getTotalRequests()).append('\n');
        builder.append("Cancelled: ").append(result.isCancelled()).append('\n');
        builder.append("Successful: ").append(result.getSuccessfulRequests()).append('\n');
        builder.append("Failed: ").append(result.getFailedRequests()).append('\n');
        builder.append("Error rate: ").append(String.format("%.2f%%", result.getErrorRate() * 100)).append('\n');
        builder.append("Requests/sec: ").append(String.format("%.2f", result.getRequestsPerSecond())).append('\n');
        builder.append("Latency min/avg/p50/p90/p95/p99/max: ")
                .append(result.getMinMillis()).append(" ms / ")
                .append(String.format("%.2f", result.getAverageMillis())).append(" ms / ")
                .append(result.getP50Millis()).append(" ms / ")
                .append(result.getP90Millis()).append(" ms / ")
                .append(result.getP95Millis()).append(" ms / ")
                .append(result.getP99Millis()).append(" ms / ")
                .append(result.getMaxMillis()).append(" ms\n");
        builder.append("Status counts: ").append(result.getStatusCounts()).append('\n');
        if (!result.getErrors().isEmpty()) {
            builder.append("\nSample errors:\n");
            for (String error : result.getErrors()) {
                builder.append("- ").append(error).append('\n');
            }
        }
        return builder.toString();
    }

    private void updateLoadProgress(int completedRequests, int requestedRequests) {
        loadResultsArea.setText("Running load test...\nCompleted " + completedRequests + " of "
                + requestedRequests + " requests.");
    }

    private String formatHistoryEntry(HistoryEntry entry) {
        String timestamp;
        try {
            timestamp = HISTORY_TIME_FORMAT.format(Instant.parse(entry.getTimestamp()));
        } catch (RuntimeException e) {
            timestamp = entry.getTimestamp();
        }
        String status = entry.getStatusCode() == 0 ? "ERR" : Integer.toString(entry.getStatusCode());
        return timestamp + "  " + entry.getMethod() + "  " + status + "  " + entry.getUrl();
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        if (bytes < 1024 * 1024) {
            return String.format("%.1f KB", bytes / 1024.0);
        }
        return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
    }

    private RequestModel copyRequest(RequestModel source) {
        RequestModel copy = new RequestModel(source.getName(), source.getMethod(), source.getUrl());
        copy.setId(source.getId());
        copy.setQueryParams(copyPairs(source.getQueryParams()));
        copy.setHeaders(copyPairs(source.getHeaders()));
        copy.setBodyType(source.getBodyType());
        copy.setBody(source.getBody());
        return copy;
    }

    private List<KeyValuePair> copyPairs(List<KeyValuePair> source) {
        if (source == null) {
            return Collections.emptyList();
        }
        return source.stream()
                .map(pair -> new KeyValuePair(pair.isEnabled(), pair.getKey(), pair.getValue()))
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private List<KeyValuePair> nonEmptyPairs(List<KeyValuePair> source) {
        if (source == null) {
            return new ArrayList<>();
        }
        return source.stream()
                .filter(pair -> pair.hasKey() || (pair.getValue() != null && !pair.getValue().isBlank()))
                .map(pair -> new KeyValuePair(pair.isEnabled(), pair.getKey(), pair.getValue()))
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private void removeSelected(TableView<KeyValuePair> table, ObservableList<KeyValuePair> items) {
        KeyValuePair selected = table.getSelectionModel().getSelectedItem();
        if (selected != null) {
            items.remove(selected);
        }
    }

    private void trimHistory() {
        while (workspace.getHistory().size() > MAX_HISTORY_ITEMS) {
            workspace.getHistory().remove(workspace.getHistory().size() - 1);
        }
    }

    private String uniqueName(String baseName, List<String> existingNames) {
        if (!existingNames.contains(baseName)) {
            return baseName;
        }
        int suffix = 2;
        while (existingNames.contains(baseName + " " + suffix)) {
            suffix++;
        }
        return baseName + " " + suffix;
    }

    private void showError(String title, String message) {
        setStatus(message);
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }

    private boolean confirm(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.CONFIRMATION);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        return alert.showAndWait()
                .filter(buttonType -> buttonType == ButtonType.OK)
                .isPresent();
    }

    private Optional<String> promptForName(String title, String label, String currentValue) {
        TextInputDialog dialog = new TextInputDialog(currentValue);
        dialog.setTitle(title);
        dialog.setHeaderText(null);
        dialog.setContentText(label);
        return dialog.showAndWait()
                .map(String::trim)
                .filter(value -> !value.isEmpty());
    }

    private String safeFilename(String value) {
        String filename = value == null ? "collection" : value.trim().replaceAll("[^A-Za-z0-9._-]+", "-");
        return filename.isBlank() ? "collection" : filename;
    }

    private void setStatus(String message) {
        statusLabel.setText(message == null ? "" : message);
    }

    private String rootMessage(Throwable throwable) {
        Throwable cursor = throwable;
        while (cursor.getCause() != null) {
            cursor = cursor.getCause();
        }
        String message = cursor.getMessage();
        return message == null || message.isBlank() ? cursor.getClass().getSimpleName() : message;
    }

    private enum NodeType {
        ROOT,
        COLLECTION,
        REQUEST
    }

    private static final class WorkspaceNode {
        private final NodeType type;
        private final CollectionModel collection;
        private final RequestModel request;

        private WorkspaceNode(NodeType type, CollectionModel collection, RequestModel request) {
            this.type = type;
            this.collection = collection;
            this.request = request;
        }

        static WorkspaceNode root() {
            return new WorkspaceNode(NodeType.ROOT, null, null);
        }

        static WorkspaceNode collection(CollectionModel collection) {
            return new WorkspaceNode(NodeType.COLLECTION, collection, null);
        }

        static WorkspaceNode request(CollectionModel collection, RequestModel request) {
            return new WorkspaceNode(NodeType.REQUEST, collection, request);
        }

        String displayName() {
            return switch (type) {
                case ROOT -> "Workspace";
                case COLLECTION -> collection.getName();
                case REQUEST -> request.getMethod() + " " + request.getName();
            };
        }
    }
}
