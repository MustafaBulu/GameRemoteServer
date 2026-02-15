package com.mustafa.gameremotepc;

import java.awt.AWTException;
import java.awt.Robot;
import java.awt.event.KeyEvent;

public class InputExecutor {
    private final Robot robot;

    public InputExecutor() {
        try {
            this.robot = new Robot();
        } catch (AWTException e) {
            throw new IllegalStateException("Robot init failed: " + e.getMessage(), e);
        }
    }

    public void executeMove(String direction) {
        int keyCode;
        switch (direction) {
            case "up":
                keyCode = KeyEvent.VK_UP;
                break;
            case "down":
                keyCode = KeyEvent.VK_DOWN;
                break;
            case "left":
                keyCode = KeyEvent.VK_LEFT;
                break;
            case "right":
                keyCode = KeyEvent.VK_RIGHT;
                break;
            default:
                return;
        }
        robot.keyPress(keyCode);
        robot.keyRelease(keyCode);
    }
}
