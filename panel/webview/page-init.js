(function () {
    Editor.isRuntime = true;

    // mixin Editor for editor
    Editor.require('app://editor/page/editor-init');

    // init scene manager
    require('./scene-manager');

    // init ipc messages
    require('./ipc');

    // init engine-framework
    Editor.require('app://engine-framework');
    require('./debug-helper');

    // init fire-assets
    Editor.require('packages://fire-assets/init');

    // init gizmos
    Editor.require('packages://fire-gizmos/init');

    // init runtime
    var runtimeUrl = 'app://runtime/runtime-' + Editor.projectInfo.runtime + '/index.html';
    EditorUI.import( runtimeUrl, function ( err ) {
        if ( err ) {
            Editor.error( 'Failed to load %s. message: %s', runtimeUrl, err.message );
            return;
        }

        require('./engine-events');
    });
})();
