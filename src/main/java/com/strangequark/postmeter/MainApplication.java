package com.strangequark.postmeter;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.stage.Screen;
import javafx.stage.Stage;

import java.io.IOException;

public class MainApplication extends Application {
    @Override
    public void start(Stage stage) throws IOException {
        FXMLLoader fxmlLoader = new FXMLLoader(MainApplication.class.getResource("main-view.fxml"));
        Scene scene = new Scene(fxmlLoader.load(), 320, 240);

        // Get screen dimensions
        Rectangle2D screenBounds = Screen.getPrimary().getBounds();

        // Set minimum width and height to 50% of screen width and height
        stage.setMinWidth(screenBounds.getWidth() * 0.5);
        stage.setMinHeight(screenBounds.getHeight() * 0.5);

        stage.setTitle("PostMeter");
        stage.setScene(scene);
        stage.show();
    }

    public static void main(String[] args) {
        launch();
    }
}