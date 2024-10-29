module com.strangequark.postmeter {
    requires javafx.controls;
    requires javafx.fxml;
    requires javafx.web;

    requires org.controlsfx.controls;
    requires com.dlsc.formsfx;
    requires org.kordamp.ikonli.javafx;
    requires com.fasterxml.jackson.databind;

    opens com.strangequark.postmeter to javafx.fxml;
    exports com.strangequark.postmeter;
}