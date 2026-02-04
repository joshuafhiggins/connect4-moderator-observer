using Godot;
using System;

public partial class BackButton : TextureButton {
  private const string BRACKET_SCENE_PATH = "res://scenes/bracket_view.tscn";

  public override void _Pressed() {
    transitionToBracket();
    base._Pressed();
  }

  private void transitionToBracket() { GetTree().ChangeSceneToFile(BRACKET_SCENE_PATH); }
}