var Ipc = require('ipc');
var Async = require('async');
var Url = require('fire-url');

Ipc.on('scene:ipc-messages', function ( ipcList ) {
    for ( var i = 0; i < ipcList.length; ++i ) {
        Ipc.emit.apply( Ipc, ipcList[i] );
    }
});

Ipc.on('scene:new-scene', function () {
    window.sceneView.newScene();
});

Ipc.on('scene:save-scene-from-page', function ( url ) {
    var sceneAsset = new cc.SceneAsset();
    sceneAsset.scene = cc(cc.director.getRunningScene());

    // NOTE: we stash scene because we want to save and reload the connected browser
    Editor.stashScene(function () {
        // reload connected browser
        Editor.sendToCore('app:reload-on-device');

        //
        Editor.sendToCore( 'scene:save-scene', url, Editor.serialize(sceneAsset) );
    });
});

Ipc.on('scene:open-scene-by-uuid', function ( uuid ) {
    window.sceneView.loadScene(uuid);
});

Ipc.on('scene:play-on-device', function () {
    Editor.stashScene( function () {
        Editor.sendToCore( 'app:play-on-device' );
    });
});

Ipc.on('scene:reload-on-device', function () {
    Editor.stashScene( function () {
        Editor.sendToCore( 'app:reload-on-device' );
    });
});

Ipc.on('scene:drop', function ( uuids, type, x, y ) {
    Editor.Selection.clear('node');
    Async.each( uuids, function ( uuid, done ) {
        Async.waterfall([
            function ( next ) {
                Editor.createNode(uuid, next);
            },

            function ( node, next ) {
                var nodeID;
                if ( node ) {
                    var wrapper = cc(node);
                    nodeID = wrapper.uuid;

                    wrapper.position = window.sceneView.pixelToScene( cc.v2(x,y) );
                    wrapper.parent = cc(cc.director.getRunningScene());
                }

                next ( null, nodeID );
            },

        ], function ( err, nodeID ) {
            if ( err ) {
                Editor.failed( 'Failed to drop asset %s, message: %s', uuid, err.stack );
                return;
            }

            if ( nodeID ) {
                Editor.Selection.select('node', nodeID, false, true );
            }
            cc.engine.repaintInEditMode();
            done();
        });
    });
});

Ipc.on('scene:create-nodes-by-uuids', function ( uuids, parentID ) {
    var parentNode;
    if ( parentID ) {
        parentNode = cc.engine.getInstanceByIdN(parentID);
    }
    if ( !parentNode ) {
        parentNode = cc.director.getRunningScene();
    }

    Editor.Selection.clear('node');

    //
    Async.each( uuids, function ( uuid, done ) {
        Async.waterfall([
            function ( next ) {
                Editor.createNode(uuid, next);
            },

            function ( node, next ) {
                var nodeID;
                if ( node ) {
                    var wrapper = cc(node);
                    nodeID = wrapper.uuid;

                    if ( parentNode ) {
                        wrapper.parent = cc(parentNode);
                    }
                    var center_x = cc.view.canvasSize.x/2;
                    var center_y = cc.view.canvasSize.y/2;
                    wrapper.scenePosition = window.sceneView.pixelToScene( cc.v2(center_x, center_y) );
                }

                next ( null, nodeID );
            },

        ], function ( err, nodeID ) {
            if ( err ) {
                Editor.failed( 'Failed to drop asset %s, message: %s', uuid, err.stack );
                return;
            }

            if ( nodeID ) {
                Editor.Selection.select('node', nodeID, false, true );
            }
            cc.engine.repaintInEditMode();
            done();
        });
    });
});

Ipc.on('scene:create-node-by-classid', function ( name, classID, referenceID, position ) {
    var parentNode;

    if ( referenceID ) {
        parentNode = cc.engine.getInstanceByIdN(referenceID);
        if ( position === 'sibling' ) {
            parentNode = cc(parentNode).parentN;
        }
    }

    if ( !parentNode ) {
        parentNode = cc.director.getRunningScene();
    }
    var Wrapper = cc.js._getClassById(classID);
    if (Wrapper) {
        var wrapper = new Wrapper();
        wrapper.createAndAttachNode();
        wrapper.parent = cc(parentNode);
        wrapper.name = name;

        var center_x = cc.view.canvasSize.x/2;
        var center_y = cc.view.canvasSize.y/2;
        wrapper.scenePosition = window.sceneView.pixelToScene( cc.v2(center_x, center_y) );

        cc.engine.repaintInEditMode();
        Editor.Selection.select('node', wrapper.uuid, true, true );
    }
    else {
        Editor.error('Unknown node to create:', classID);
    }
});

Ipc.on('scene:query-hierarchy', function ( queryID ) {
    if (!cc.engine.isInitialized) {
        return Editor.sendToWindows( 'scene:reply-query-hierarchy', queryID, '', [] );
    }
    var nodes = Editor.getHierarchyDump();
    var sceneUuid = cc(cc.director.getRunningScene()).uuid;
    Editor.sendToWindows( 'scene:reply-query-hierarchy', queryID, sceneUuid, nodes );
});

Ipc.on('scene:query-node', function ( queryID, nodeID ) {
    var node = cc.engine.getInstanceByIdN(nodeID);
    var dump = Editor.getNodeDump(node);
    dump = JSON.stringify(dump);    // 改成发送字符串，以免字典的顺序发生改变
    Editor.sendToWindows( 'scene:reply-query-node', queryID, dump );
});

Ipc.on('scene:query-node-info', function ( sessionID, nodeID ) {
    var nodeWrapper = cc.engine.getInstanceById(nodeID);

    Editor.sendToWindows( 'scene:query-node-info:reply', sessionID, {
        name: nodeWrapper ? nodeWrapper.name : '',
        type: cc.js.getClassName(nodeWrapper),
        missed: nodeWrapper ? false : true,
    });
});

Ipc.on('scene:node-new-property', function ( info ) {
    var node = cc.engine.getInstanceByIdN(info.id);
    if (node) {
        var objToSet = info.mixinType ? node : cc(node);
        try {
            var id = info.type;
            var ctor;
            if (cc.js._isTempClassId(id)) {
                ctor = cc.js._getClassById(id);
            }
            else {
                ctor = cc.js.getClassByName(id);
            }
            if ( ctor ) {
                var obj;
                try {
                    obj = new ctor();
                }
                catch (e) {
                    Editor.error('Can not create new info.type directly.\nInner message: ' + e.stack);
                    return;
                }
                Editor.setDeepPropertyByPath(objToSet, info.path, obj, info.type);
                cc.engine.repaintInEditMode();
            }
        }
        catch (e) {
            Editor.warn('Failed to new property %s of %s to %s, ' + e.message,
                info.path, cc(node).name, info.value);
        }
    }
});

Ipc.on('scene:node-set-property', function ( info ) {
    var node = cc.engine.getInstanceByIdN(info.id);
    if (node) {
        var objToSet = info.mixinType ? node : cc(node);
        try {
            Editor.setDeepPropertyByPath(objToSet, info.path, info.value, info.type);
            cc.engine.repaintInEditMode();
        }
        catch (e) {
            Editor.warn('Failed to set property %s of %s to %s, ' + e.message,
                info.path, cc(node).name, info.value);
        }
    }
});

Ipc.on('scene:node-mixin', function ( id, uuid ) {
    if (uuid && Editor.isUuid(uuid)) {
        // check script
        var className = Editor.compressUuid(uuid);
        var classToMix = cc.js._getClassById(className);
        if (!classToMix) {
            return Editor.error('Can not find Behavior in the script "%s".', uuid);
        }
        //
        var node = cc.engine.getInstanceByIdN(id);
        if (node) {
            cc.mixin(node, classToMix);
        }
        else {
            Editor.error('Can not find node to mixin: %s', id);
        }
    }
    else {
        Editor.error('invalid script to mixin');
    }
});

Ipc.on('scene:node-unmixin', function ( id, className ) {
    var node = cc.engine.getInstanceByIdN(id);
    if (node) {
        cc.unMixin( node, className);
    }
});

Ipc.on('scene:move-nodes', function ( ids, parentID, nextSiblingId ) {
    var parent;

    if (parentID)
        parent = cc.engine.getInstanceById(parentID);
    else
        parent = cc(cc.director.getRunningScene());

    var next = nextSiblingId ? cc.engine.getInstanceById(nextSiblingId) : null;
    var nextIndex = next ? next.getSiblingIndex() : -1;

    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var wrapper = cc.engine.getInstanceById(id);
        if (wrapper && (!parent || !parent.isChildOf(wrapper))) {
            if (wrapper.parent !== parent) {
                // keep world transform not changed
                var worldPos = wrapper.worldPosition;
                var worldRotation = wrapper.worldRotation;
                var lossyScale = wrapper.worldScale;

                wrapper.parent = parent;

                // restore world transform
                wrapper.worldPosition = worldPos;
                wrapper.worldRotation = worldRotation;
                if (parent) {
                    wrapper.scale = lossyScale.divSelf(parent.worldScale);
                }
                else {
                    wrapper.scale = lossyScale;
                }

                if (next) {
                    wrapper.setSiblingIndex(nextIndex);
                    ++nextIndex;
                }
            }
            else if (next) {
                var lastIndex = wrapper.getSiblingIndex();
                var newIndex = nextIndex;
                if (newIndex > lastIndex) {
                    --newIndex;
                }
                if (newIndex !== lastIndex) {
                    wrapper.setSiblingIndex(newIndex);
                    if (lastIndex > newIndex) {
                        ++nextIndex;
                    }
                    else {
                        --nextIndex;
                    }
                }
            }
            else {
                wrapper.setAsLastSibling();
            }
        }
    }
});

Ipc.on('scene:delete-nodes', function ( ids ) {
    window.sceneView.delete(ids);
});

Ipc.on('scene:duplicate-nodes', function ( ids ) {
    var wrappers = [];
    for ( var i = 0; i < ids.length; ++i ) {
         var wrapper = cc.engine.getInstanceById(ids[i]);
        if (wrapper) {
            wrappers.push(wrapper);
        }
    }

    // get top-level wrappers
    var results = Editor.Utils.arrayCmpFilter ( wrappers, function ( a, b ) {
        if (a === b) {
            return 0;
        }

        if (b.isChildOf(a)) {
            return 1;
        }

        if (a.isChildOf(b)) {
            return -1;
        }

        return 0;
    });


    // duplicate results
    var clones = [];
    results.forEach(function ( wrapper ) {
        var clone = cc.instantiate(wrapper);
        clone.parent = wrapper.parent;

        clones.push(clone.uuid);
    });

    // select the last one
    Editor.Selection.select('node', clones);
});

Ipc.on('scene:stash-and-reload', function () {
    Editor.stashScene(function () {
        Ipc.sendToHost('scene:ask-for-reload');
    });
});

Ipc.on('scene:soft-reload', function (compiled) {
    Editor.softReload(compiled);
});

Ipc.on('selection:activated', function ( type, id ) {
    if ( type !== 'node' || !id ) {
        return;
    }

    window.sceneView.activate(id);
});

Ipc.on('selection:deactivated', function ( type, id ) {
    if ( type !== 'node' ) {
        return;
    }

    window.sceneView.deactivate(id);
});

Ipc.on('selection:selected', function ( type, ids ) {
    if ( type !== 'node' ) {
        return;
    }
    window.sceneView.select(ids);
});

Ipc.on('selection:unselected', function ( type, ids ) {
    if ( type !== 'node' ) {
        return;
    }
    window.sceneView.unselect(ids);
});

Ipc.on('selection:hoverin', function ( type, id ) {
    if ( type !== 'node' ) {
        return;
    }
    window.sceneView.hoverin(id);
});

Ipc.on('selection:hoverout', function ( type, id ) {
    if ( type !== 'node' ) {
        return;
    }
    window.sceneView.hoverout(id);
});

Ipc.on('scene:init-scene-view', function ( settings ) {
    window.sceneView.$.gizmosView.transformTool = settings.transformTool;
    window.sceneView.$.gizmosView.coordinate = settings.coordinate;
    window.sceneView.$.gizmosView.pivot = settings.pivot;
    window.sceneView.$.gizmosView.designSize = [settings.designWidth, settings.designHeight];
});

Ipc.on('scene:transform-tool-changed', function ( value ) {
    window.sceneView.$.gizmosView.transformTool = value;
    cc.engine.repaintInEditMode();
});

Ipc.on('scene:coordinate-changed', function ( value ) {
    window.sceneView.$.gizmosView.coordinate = value;
    cc.engine.repaintInEditMode();
});

Ipc.on('scene:pivot-changed', function ( value ) {
    window.sceneView.$.gizmosView.pivot = value;
    cc.engine.repaintInEditMode();
});

Ipc.on('scene:design-size-changed', function ( w, h ) {
    window.sceneView.$.gizmosView.designSize = [w, h];
    cc.engine.repaintInEditMode();
});

Ipc.on('scene:create-prefab', function ( id, baseUrl ) {
    var wrapper = cc.engine.getInstanceById(id);
    var prefab = Editor.PrefabUtils.createPrefabFrom(wrapper);
    var json = Editor.serialize(prefab);
    var url = Url.join(baseUrl, wrapper.name + '.prefab');

    Editor.sendRequestToCore('scene:create-prefab', url, json, function (err, uuid) {
        if (!err) {
            Editor.PrefabUtils.savePrefabUuid(wrapper, uuid);
        }
    });
});

Ipc.on('scene:apply-prefab', function ( id ) {
    var wrapper = cc.engine.getInstanceById(id);
    if (!wrapper || !wrapper._prefab) {
        return;
    }

    wrapper = wrapper._prefab.rootWrapper;
    var uuid = wrapper._prefab.asset._uuid;
    var prefab = Editor.PrefabUtils.createPrefabFrom(wrapper);
    Editor.PrefabUtils.savePrefabUuid(wrapper, uuid);
    var json = Editor.serialize(prefab);

    Editor.sendToCore('scene:apply-prefab', uuid, json);
});

Ipc.on('scene:revert-prefab', function ( id ) {
    var wrapper = cc.engine.getInstanceById(id);
    if (!wrapper || !wrapper._prefab) {
        return;
    }

    wrapper = wrapper._prefab.rootWrapper;
    Editor.PrefabUtils.revertPrefab(wrapper);
});

