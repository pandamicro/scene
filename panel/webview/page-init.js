(function () {
    Editor.projectInfo = Editor.remote.projectInfo;
    Editor.libraryPath = Editor.remote.libraryPath;

    if ( !Editor.assets ) Editor.assets = {};
    if ( !Editor.metas ) Editor.metas = {};
    if ( !Editor.inspectors ) Editor.inspectors = {};

    // init ipc messages
    require('./ipc');

    // init engine-framework
    Editor.require('app://engine-framework');

    // init canvas-assets
    // TODO: do we really need meta in scene-webview ???
    var Meta = Editor.require('app://asset-db/lib/meta');
    Editor.metas.asset = Meta.AssetMeta;
    Editor.metas.folder = Meta.FolderMeta;
    Editor.require('packages://canvas-assets/init');

    // init runtime
    var runtimeUrl = 'app://runtime/runtime-' + Editor.projectInfo.runtime + '/index.html';
    Polymer.Base.importHref( runtimeUrl, function ( event ) {
        // init asset library
        Fire.AssetLibrary.init(Editor.libraryPath);

        // init engine
        var canvasEL = document.getElementById('canvas');
        var bcr = document.body.getBoundingClientRect();
        canvasEL.width  = bcr.width;
        canvasEL.height = bcr.height;

        //
        Fire.Engine.init({
            width: bcr.width,
            height: bcr.height,
            canvas: canvasEL,
        }, function ( err ) {
            // TODO:
        });

        // debounce resize
        var _resizeDebounceID = null;
        window.onresize = function () {
            // debounce write for 10ms
            if ( _resizeDebounceID ) {
                return;
            }
            _resizeDebounceID = setTimeout(function () {
                _resizeDebounceID = null;
                bcr = document.body.getBoundingClientRect();
                Fire.Engine.resize( bcr.width, bcr.height );
            }, 10);
        };
    }, function ( err ) {
        Editor.error( 'Failed to load %s. message: %s', runtimeUrl, err.message );
    });
})();
