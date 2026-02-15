package com.mustafa.gameremotepc;

import javax.swing.SwingUtilities;

public class Main {
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> new PcClientFrame().setVisible(true));
    }
}
