// Auto-generated from public/levels/kitchen-layout.json. Do not edit directly.
export default {
  "version": 1,
  "primitives": [
    {
      "id": "builtin-floor",
      "name": "Floor",
      "type": "plane",
      "position": {
        "x": -0.6667,
        "y": 0,
        "z": -0.6414
      },
      "rotation": {
        "x": -1.5708,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1.221,
        "y": 1.3839,
        "z": 1
      },
      "texture": {
        "atlas": "textures3",
        "cell": 4,
        "repeat": {
          "x": 6,
          "y": 6
        },
        "rotation": 0
      },
      "material": {
        "color": "#d4a574",
        "roughness": 0.98,
        "metalness": 0.02
      },
      "faceTextures": {},
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": false,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "builtin-back-wall",
      "name": "BackWall",
      "type": "box",
      "position": {
        "x": 0,
        "y": 2,
        "z": -4
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 30,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#e8dcc8",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 30
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "builtin-front-wall",
      "name": "FrontWall",
      "type": "box",
      "position": {
        "x": 0,
        "y": 2,
        "z": 4
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 30,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#e8dcc8",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 30
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "builtin-left-wall",
      "name": "LeftWall",
      "type": "box",
      "position": {
        "x": -4,
        "y": 2,
        "z": 0
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 30,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#e8dcc8",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 30
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "builtin-right-wall",
      "name": "RightWall",
      "type": "box",
      "position": {
        "x": 4,
        "y": 2,
        "z": 0
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 30,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#e8dcc8",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 30
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "builtin-ceiling",
      "name": "Ceiling",
      "type": "plane",
      "position": {
        "x": 0,
        "y": 4,
        "z": 0
      },
      "rotation": {
        "x": 1.5708,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 29,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#e8dcc8",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {},
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": false,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-BackCounterLeft",
      "name": "BackCounterLeft",
      "type": "box",
      "position": {
        "x": -2.05,
        "y": 0.45,
        "z": -3.45
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-BackCounterSink",
      "name": "BackCounterSink",
      "type": "box",
      "position": {
        "x": -0.25,
        "y": 0.45,
        "z": -3.45
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-BackCounterRight",
      "name": "BackCounterRight",
      "type": "box",
      "position": {
        "x": 1.7,
        "y": 0.45,
        "z": -3.45
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-BackCounterTop",
      "name": "BackCounterTop",
      "type": "box",
      "position": {
        "x": 0,
        "y": 0.96,
        "z": -3.45
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 31,
        "repeat": {
          "x": 4.2,
          "y": 0.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#d7c6af",
        "roughness": 0.72,
        "metalness": 0.08
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 31
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-CounterBacksplash",
      "name": "CounterBacksplash",
      "type": "box",
      "position": {
        "x": 0,
        "y": 1.34,
        "z": -3.53
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 33,
        "repeat": {
          "x": 6,
          "y": 0.9
        },
        "rotation": 0
      },
      "material": {
        "color": "#dfeaf4",
        "roughness": 0.8,
        "metalness": 0.05
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 33
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-UpperCabinetLeft",
      "name": "UpperCabinetLeft",
      "type": "box",
      "position": {
        "x": -2.05,
        "y": 1.83,
        "z": -3.55
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 28,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.95,
        "metalness": 0.03
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 28
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-UpperCabinetCenter",
      "name": "UpperCabinetCenter",
      "type": "box",
      "position": {
        "x": -0.2,
        "y": 1.83,
        "z": -3.55
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 28,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.95,
        "metalness": 0.03
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 28
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-UpperCabinetRight",
      "name": "UpperCabinetRight",
      "type": "box",
      "position": {
        "x": 1.7,
        "y": 1.83,
        "z": -3.55
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 28,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.95,
        "metalness": 0.03
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 28
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-StoveOven",
      "name": "StoveOven",
      "type": "box",
      "position": {
        "x": -2.02,
        "y": 0.48,
        "z": -3.43
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 44,
        "repeat": {
          "x": 0.9,
          "y": 0.8
        },
        "rotation": 0
      },
      "material": {
        "color": "#d8d8d8",
        "roughness": 0.52,
        "metalness": 0.33
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 44
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-StoveTop",
      "name": "StoveTop",
      "type": "box",
      "position": {
        "x": -2.02,
        "y": 0.91,
        "z": -3.43
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#111111",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 0
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-StoveKnob0",
      "name": "StoveKnob0",
      "type": "box",
      "position": {
        "x": -2.23,
        "y": 0.79,
        "z": -3.12
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#2b2b2b",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 0
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-StoveKnob1",
      "name": "StoveKnob1",
      "type": "box",
      "position": {
        "x": -2.02,
        "y": 0.79,
        "z": -3.12
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#2b2b2b",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 0
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-StoveKnob2",
      "name": "StoveKnob2",
      "type": "box",
      "position": {
        "x": -1.81,
        "y": 0.79,
        "z": -3.12
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#2b2b2b",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 0
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-SinkBasin",
      "name": "SinkBasin",
      "type": "box",
      "position": {
        "x": -0.35,
        "y": 0.78,
        "z": -3.43
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 44,
        "repeat": {
          "x": 0.9,
          "y": 0.8
        },
        "rotation": 0
      },
      "material": {
        "color": "#d8d8d8",
        "roughness": 0.52,
        "metalness": 0.33
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 44
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-SinkFaucet",
      "name": "SinkFaucet",
      "type": "box",
      "position": {
        "x": -0.18,
        "y": 1,
        "z": -3.27
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 44,
        "repeat": {
          "x": 0.9,
          "y": 0.8
        },
        "rotation": 0
      },
      "material": {
        "color": "#d8d8d8",
        "roughness": 0.52,
        "metalness": 0.33
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 44
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-Microwave",
      "name": "Microwave",
      "type": "box",
      "position": {
        "x": 1.45,
        "y": 1.15,
        "z": -3.41
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 44,
        "repeat": {
          "x": 0.9,
          "y": 0.8
        },
        "rotation": 0
      },
      "material": {
        "color": "#d8d8d8",
        "roughness": 0.52,
        "metalness": 0.33
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 44
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-Fridge",
      "name": "Fridge",
      "type": "box",
      "position": {
        "x": 2.95,
        "y": 1.025,
        "z": -2.55
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 40,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#d8d8d8",
        "roughness": 0.48,
        "metalness": 0.14
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 40
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-FridgeHandle",
      "name": "FridgeHandle",
      "type": "box",
      "position": {
        "x": 3.43,
        "y": 1.1,
        "z": -2.15
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#e0e0e0",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 0
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-TrashCan",
      "name": "TrashCan",
      "type": "box",
      "position": {
        "x": 2.6,
        "y": 0.31,
        "z": 1.8
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#7f7f7f",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 0
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningTableTop",
      "name": "DiningTableTop",
      "type": "box",
      "position": {
        "x": -1.9,
        "y": 0.78,
        "z": 1.2
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningTableLeg0",
      "name": "DiningTableLeg0",
      "type": "box",
      "position": {
        "x": -2.8,
        "y": 0.39,
        "z": 0.55
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningTableLeg1",
      "name": "DiningTableLeg1",
      "type": "box",
      "position": {
        "x": -1,
        "y": 0.39,
        "z": 0.55
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningTableLeg2",
      "name": "DiningTableLeg2",
      "type": "box",
      "position": {
        "x": -2.8,
        "y": 0.39,
        "z": 1.85
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningTableLeg3",
      "name": "DiningTableLeg3",
      "type": "box",
      "position": {
        "x": -1,
        "y": 0.39,
        "z": 1.85
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningChairSeat0",
      "name": "DiningChairSeat0",
      "type": "box",
      "position": {
        "x": -2.4177,
        "y": 0.45,
        "z": 0.6
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 84,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#eadfbc",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 84
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningChairBack0",
      "name": "DiningChairBack0",
      "type": "box",
      "position": {
        "x": -2.4179,
        "y": 0.8757,
        "z": 0.38
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 28,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.95,
        "metalness": 0.03
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 28
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningChairSeat1",
      "name": "DiningChairSeat1",
      "type": "box",
      "position": {
        "x": -1.4092,
        "y": 0.45,
        "z": 0.6
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 84,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#eadfbc",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 84
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningChairBack1",
      "name": "DiningChairBack1",
      "type": "box",
      "position": {
        "x": -1.4097,
        "y": 0.8705,
        "z": 0.38
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 28,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.95,
        "metalness": 0.03
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 28
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningChairSeat2",
      "name": "DiningChairSeat2",
      "type": "box",
      "position": {
        "x": -2.4532,
        "y": 0.45,
        "z": 1.85
      },
      "rotation": {
        "x": 0,
        "y": 3.1416,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 84,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#eadfbc",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 84
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningChairBack2",
      "name": "DiningChairBack2",
      "type": "box",
      "position": {
        "x": -2.4544,
        "y": 0.8715,
        "z": 2.0493
      },
      "rotation": {
        "x": 0,
        "y": 3.1416,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 28,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.95,
        "metalness": 0.03
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 28
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningChairSeat3",
      "name": "DiningChairSeat3",
      "type": "box",
      "position": {
        "x": -1.3621,
        "y": 0.45,
        "z": 1.85
      },
      "rotation": {
        "x": 0,
        "y": 3.1416,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 84,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#eadfbc",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 84
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DiningChairBack3",
      "name": "DiningChairBack3",
      "type": "box",
      "position": {
        "x": -1.3635,
        "y": 0.8755,
        "z": 2.0501
      },
      "rotation": {
        "x": 0,
        "y": 3.1416,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 28,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.95,
        "metalness": 0.03
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 28
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-FrontDoor",
      "name": "FrontDoor",
      "type": "box",
      "position": {
        "x": 3,
        "y": 1.05,
        "z": 3.91
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-PantryDoor",
      "name": "PantryDoor",
      "type": "box",
      "position": {
        "x": -3.91,
        "y": 1,
        "z": 1.1
      },
      "rotation": {
        "x": 0,
        "y": 1.5708,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 11,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#8b6f47",
        "roughness": 0.92,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 11
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-KitchenWindowFrame",
      "name": "KitchenWindowFrame",
      "type": "box",
      "position": {
        "x": -0.35,
        "y": 1.85,
        "z": -3.5
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#e6d2b0",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 0
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-KitchenWindowGlass",
      "name": "KitchenWindowGlass",
      "type": "box",
      "position": {
        "x": -0.35,
        "y": 1.83,
        "z": -3.54
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#a7d8ff",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 0
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DishRack",
      "name": "DishRack",
      "type": "box",
      "position": {
        "x": 0.95,
        "y": 1,
        "z": -3.33
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 76,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "material": {
        "color": "#d9d9d9",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 76
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "builtin-DishTowel",
      "name": "DishTowel",
      "type": "box",
      "position": {
        "x": 1.55,
        "y": 0.7473,
        "z": -3.0817
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1,
        "y": 1,
        "z": 1
      },
      "texture": {
        "atlas": "textures",
        "cell": 84,
        "repeat": {
          "x": 1.5,
          "y": 1.5
        },
        "rotation": 0
      },
      "material": {
        "color": "#eadfbc",
        "roughness": 1,
        "metalness": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 84
        }
      },
      "prefabId": null,
      "prefabInstanceId": null,
      "prefabInstanceOrigin": null,
      "collider": false,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": true
    },
    {
      "id": "prefab-instance-mnm0jq8i-tn59l-part-1",
      "name": "fridge-fridge",
      "type": "box",
      "position": {
        "x": 0.9637,
        "y": 1.5,
        "z": -3.3132
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1.25,
        "y": 3,
        "z": 1.25
      },
      "texture": {
        "atlas": "textures",
        "cell": 40,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures",
          "cell": 37
        },
        "left": {
          "atlas": "textures",
          "cell": 37
        },
        "top": {
          "atlas": "textures",
          "cell": 37
        },
        "bottom": {
          "atlas": "textures",
          "cell": 37
        },
        "back": {
          "atlas": "textures",
          "cell": 49
        }
      },
      "material": {
        "color": "#ffffff",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "prefabId": "prefab-mnls4d08-4gxlh",
      "prefabInstanceId": "prefab-instance-mnm0jq8i-tn59l",
      "prefabInstanceOrigin": {
        "x": 0.9637,
        "y": 1.5,
        "z": -3.3132
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0jq8i-tn59l-part-2",
      "name": "fridge-box-part",
      "type": "box",
      "position": {
        "x": 0.9637,
        "y": 0.4241,
        "z": -3.7581
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.5,
        "y": 0.5,
        "z": 0.5
      },
      "texture": {
        "atlas": "textures",
        "cell": 0,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {
        "back": {
          "atlas": "textures",
          "cell": 46
        }
      },
      "material": {
        "color": "#ffffff",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "prefabId": "prefab-mnls4d08-4gxlh",
      "prefabInstanceId": "prefab-instance-mnm0jq8i-tn59l",
      "prefabInstanceOrigin": {
        "x": 0.9637,
        "y": 1.5,
        "z": -3.3132
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0jxz7-iz3s8-part-1",
      "name": "chair-leg",
      "type": "box",
      "position": {
        "x": -3.5333333333333337,
        "y": 0.25,
        "z": -2.2
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.05,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 5,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#8B4513",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0jxz7-iz3s8",
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0jxz7-iz3s8-part-2",
      "name": "chair-leg",
      "type": "box",
      "position": {
        "x": -3.1333333333333333,
        "y": 0.25,
        "z": -2.2
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.05,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 5,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#8B4513",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0jxz7-iz3s8",
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0jxz7-iz3s8-part-3",
      "name": "chair-leg",
      "type": "box",
      "position": {
        "x": -3.5333333333333337,
        "y": 0.25,
        "z": -1.8
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.05,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 5,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#8B4513",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0jxz7-iz3s8",
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0jxz7-iz3s8-part-4",
      "name": "chair-leg",
      "type": "box",
      "position": {
        "x": -3.1333333333333333,
        "y": 0.25,
        "z": -1.8
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.05,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 5,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#8B4513",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0jxz7-iz3s8",
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0jxz7-iz3s8-part-5",
      "name": "chair-seat",
      "type": "box",
      "position": {
        "x": -3.3333333333333335,
        "y": 0.525,
        "z": -2
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.5,
        "y": 0.05,
        "z": 0.5
      },
      "texture": {
        "atlas": "textures3",
        "cell": 52,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#A0522D",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0jxz7-iz3s8",
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0jxz7-iz3s8-part-6",
      "name": "chair-backrest",
      "type": "box",
      "position": {
        "x": -3.3333333333333335,
        "y": 0.775,
        "z": -1.775
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.5,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 52,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#A0522D",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0jxz7-iz3s8",
      "prefabInstanceOrigin": null,
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0k3f1-9zcj6-part-1",
      "name": "chair-leg",
      "type": "box",
      "position": {
        "x": 3.2243,
        "y": 0.25,
        "z": -0.4209
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.05,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 5,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#8B4513",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0k3f1-9zcj6",
      "prefabInstanceOrigin": {
        "x": 3.2243,
        "y": 0.25,
        "z": -0.4209
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0k3f1-9zcj6-part-2",
      "name": "chair-leg",
      "type": "box",
      "position": {
        "x": 3.6243,
        "y": 0.25,
        "z": -0.4209
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.05,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 5,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#8B4513",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0k3f1-9zcj6",
      "prefabInstanceOrigin": {
        "x": 3.2243,
        "y": 0.25,
        "z": -0.4209
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0k3f1-9zcj6-part-3",
      "name": "chair-leg",
      "type": "box",
      "position": {
        "x": 3.2243,
        "y": 0.25,
        "z": -0.0209
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.05,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 5,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#8B4513",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0k3f1-9zcj6",
      "prefabInstanceOrigin": {
        "x": 3.2243,
        "y": 0.25,
        "z": -0.4209
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0k3f1-9zcj6-part-4",
      "name": "chair-leg",
      "type": "box",
      "position": {
        "x": 3.6243,
        "y": 0.25,
        "z": -0.0209
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.05,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 5,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#8B4513",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0k3f1-9zcj6",
      "prefabInstanceOrigin": {
        "x": 3.2243,
        "y": 0.25,
        "z": -0.4209
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0k3f1-9zcj6-part-5",
      "name": "chair-seat",
      "type": "box",
      "position": {
        "x": 3.4243,
        "y": 0.525,
        "z": -0.2209
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.5,
        "y": 0.05,
        "z": 0.5
      },
      "texture": {
        "atlas": "textures3",
        "cell": 52,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#A0522D",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0k3f1-9zcj6",
      "prefabInstanceOrigin": {
        "x": 3.2243,
        "y": 0.25,
        "z": -0.4209
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0k3f1-9zcj6-part-6",
      "name": "chair-backrest",
      "type": "box",
      "position": {
        "x": 3.4243,
        "y": 0.775,
        "z": 0.0041
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 0.5,
        "y": 0.5,
        "z": 0.05
      },
      "texture": {
        "atlas": "textures3",
        "cell": 52,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {},
      "material": {
        "color": "#A0522D",
        "roughness": 0.8,
        "metalness": 0
      },
      "prefabId": "prefab-mnlzgh57-sy1xr",
      "prefabInstanceId": "prefab-instance-mnm0k3f1-9zcj6",
      "prefabInstanceOrigin": {
        "x": 3.2243,
        "y": 0.25,
        "z": -0.4209
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0wtup-6v0dy-part-1",
      "name": "Oven 2-box-part",
      "type": "box",
      "position": {
        "x": 2.3911,
        "y": 0.625,
        "z": -3.3333
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1.3333,
        "y": 1.25,
        "z": 1.3333
      },
      "texture": {
        "atlas": "textures3",
        "cell": 41,
        "repeat": {
          "x": 1,
          "y": 1
        },
        "rotation": 0
      },
      "faceTextures": {
        "right": {
          "atlas": "textures3",
          "cell": 41
        },
        "left": {
          "atlas": "textures3",
          "cell": 41
        },
        "top": {
          "atlas": "textures",
          "cell": 45
        },
        "front": {
          "atlas": "textures3",
          "cell": 35
        },
        "back": {
          "atlas": "textures3",
          "cell": 40
        }
      },
      "material": {
        "color": "#ffffff",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "prefabId": "counter-module",
      "prefabInstanceId": "prefab-instance-mnm0wtup-6v0dy",
      "prefabInstanceOrigin": {
        "x": 2.3911,
        "y": 0,
        "z": -3.3333
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    },
    {
      "id": "prefab-instance-mnm0wtup-6v0dy-part-2",
      "name": "Oven 2-box-part",
      "type": "box",
      "position": {
        "x": 2.3911,
        "y": 1.2549,
        "z": -3.878
      },
      "rotation": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "scale": {
        "x": 1.25,
        "y": 0.25,
        "z": 0.25
      },
      "texture": {
        "atlas": "textures2",
        "cell": 27,
        "repeat": {
          "x": 1,
          "y": 0.1
        },
        "rotation": 0
      },
      "faceTextures": {
        "front": {
          "atlas": "textures2",
          "cell": 27
        },
        "back": {
          "atlas": "textures2",
          "cell": 23
        }
      },
      "material": {
        "color": "#ffffff",
        "roughness": 0.88,
        "metalness": 0.04
      },
      "prefabId": "counter-module",
      "prefabInstanceId": "prefab-instance-mnm0wtup-6v0dy",
      "prefabInstanceOrigin": {
        "x": 2.3911,
        "y": 0,
        "z": -3.3333
      },
      "collider": true,
      "castShadow": true,
      "receiveShadow": true,
      "deleted": false
    }
  ]
};
