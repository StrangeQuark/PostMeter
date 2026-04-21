module com.strangequark.postmeter {
    requires javafx.controls;
    requires javafx.fxml;
    requires java.net.http;
    requires static jdk.httpserver;
    requires com.fasterxml.jackson.databind;

    opens com.strangequark.postmeter to javafx.fxml;
    opens com.strangequark.postmeter.model to com.fasterxml.jackson.databind;
    exports com.strangequark.postmeter;
    exports com.strangequark.postmeter.model;
    exports com.strangequark.postmeter.service;
}
