using Godot;
using System;

public partial class AddressUI : TextEdit
{
	public override void _Ready()
	{
		Text = Connection.WS_DEFAULT_ADDRESS;
	}
}
