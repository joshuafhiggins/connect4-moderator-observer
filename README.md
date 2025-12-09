# Connect4 Moderator - Observer

The front end for the [server](https://github.com/joshuafhiggins/connect4-moderator-server) made in [Godot](https://godotengine.org/), an open-soruce game engine.

# Downloads
See [releases](https://github.com/joshuafhiggins/connect4-moderator-observer/releases)

# For Future Maintainers
This was made in Godot 4.5. Due to the use of C# for a lot of the scripting, we are unable to export for the web but [progress is being made](https://github.com/godotengine/godot/pull/106125). An icon in Icon Composer was made for macOS builds but can't be used till Godot 4.6. Currently, there is also a bug in Godot's Websocket implementation that causes random disconnects, options are submitting upstream fixes and debugging or wrapping a third party library to use. It would also be nice to rework the bracket screen to show the bracket and be more thematic with the other pixel art pieces. Some scripts are leftovers/incomplete implementations of having this program act as a client, which would be helpful to finish.