// Internal source transformations shared by cube and LOD shadow receivers.
export function injectStarMadeShadowVertex(vertexShader: string): string {
  const usesDecodedCubeVertex =
    /\bvPos\s*=\s*modelViewMatrix\s*\*\s*vec4\s*\(\s*vertexPos\s*,\s*1\.0\s*\)\s*;/.test(vertexShader);
  const worldPositionExpression = usesDecodedCubeVertex
    ? "modelMatrix * vec4(vertexPos, 1.0)"
    : "modelMatrix * vec4(position, 1.0)";
  const header = [
    "uniform mat4 starMadeShadowMatrix0;",
    "uniform mat4 starMadeShadowMatrix1;",
    "uniform mat4 starMadeShadowMatrix2;",
    "out vec4 starMadeShadowCoord0;",
    "out vec4 starMadeShadowCoord1;",
    "out vec4 starMadeShadowCoord2;",
    ""
  ].join("\n");
  const assignment = [
    `vec4 starMadeShadowWorldPosition = ${worldPositionExpression};`,
    "\tstarMadeShadowCoord0 = starMadeShadowMatrix0 * starMadeShadowWorldPosition;",
    "\tstarMadeShadowCoord1 = starMadeShadowMatrix1 * starMadeShadowWorldPosition;",
    "\tstarMadeShadowCoord2 = starMadeShadowMatrix2 * starMadeShadowWorldPosition;"
  ].join("\n\t");

  if (!vertexShader.includes("gl_Position")) {
    throw new Error("StarMade cube vertex shader does not expose gl_Position for LOD shadow injection");
  }

  return header + vertexShader.replace(/(gl_Position\s*=\s*[^;]+;)/, `$1\n\t${assignment}`);
}

function starMadeShadowFragmentHeader(): string {
  return [
    "uniform sampler2DArray starMadeShadowMapArray;",
    "uniform bool starMadeShadowUseMapArray;",
    "uniform int starMadeShadowMapArrayMode;",
    "uniform sampler2D starMadeShadowMap0;",
    "uniform sampler2D starMadeShadowMap1;",
    "uniform sampler2D starMadeShadowMap2;",
    "uniform vec3 starMadeShadowColor0;",
    "uniform vec3 starMadeShadowColor1;",
    "uniform vec3 starMadeShadowColor2;",
    "uniform float starMadeShadowStrength;",
    "uniform float starMadeShadowBias;",
    "uniform vec2 starMadeShadowTexelSize;",
    "uniform vec2 starMadeShadowTexSize;",
    "uniform vec4 starMadeShadowFarDistances;",
    "uniform int starMadeShadowSplits;",
    "in vec4 starMadeShadowCoord0;",
    "in vec4 starMadeShadowCoord1;",
    "in vec4 starMadeShadowCoord2;",
    "const float starMadeShadowSeam = 0.0001;",
    "const float starMadeShadowSeamMult = 1.0 / (starMadeShadowSeam * 2.0);",
    "int starMadeShadowMinI(int a, int b){",
    "	return a < b ? a : b;",
    "}",
    "int starMadeShadowSplitCount(){",
    "	return max(1, min(3, starMadeShadowSplits));",
    "}",
    "vec4 starMadeShadowCoordForIndex(int index){",
    "	if(index <= 0){ return starMadeShadowCoord0; }",
    "	if(index == 1){ return starMadeShadowCoord1; }",
    "	return starMadeShadowCoord2;",
    "}",
    "float starMadeShadowDepthForIndex(int index, vec2 uv){",
    "	float shadowDepth = 0.0;",
    "	if(starMadeShadowUseMapArray){",
    "		shadowDepth = texture(starMadeShadowMapArray, vec3(uv, float(index))).r;",
    "	}else if(index <= 0){ shadowDepth = texture(starMadeShadowMap0, uv).r; }",
    "	else if(index == 1){ shadowDepth = texture(starMadeShadowMap1, uv).r; }",
    "	else{ shadowDepth = texture(starMadeShadowMap2, uv).r; }",
    "	return shadowDepth;",
    "}",
    "// Compare each texel at its own sample center on the receiver plane. This",
    "// removes slope-dependent self-shadowing without detaching contact shadows.",
    "float starMadeShadowCompare(int index, vec2 uv, float receiverDepth){",
    "    if(any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))){ return 1.0; }",
    "    float storedDepth = starMadeShadowDepthForIndex(index, uv);",
    "    if(storedDepth <= 0.0 || storedDepth >= 1.0){ return 1.0; }",
    // shadow.glsl's default comparison is receiver/stored <= 1.0005.
    // Preserve its relative tolerance with raw floating-point depth textures.
    "    return receiverDepth - starMadeShadowBias <= storedDepth * 1.0005 ? 1.0 : 0.0;",
    "}",
    "float shad(int index){",
    "    vec4 coord = starMadeShadowCoordForIndex(index);",
    "    vec3 uvz = coord.xyz / max(coord.w, 0.000001);",
    "    // Derivatives must be evaluated before branches on per-fragment coordinates.",
    "    vec3 dx = dFdx(uvz);",
    "    vec3 dy = dFdy(uvz);",
    "    float determinant = dx.x * dy.y - dx.y * dy.x;",
    "    // At grazing incidence the projected receiver collapses to a line.",
    "    // Its depth gradient is undefined; floating-point noise must not become",
    "    // a checkerboard of shadow comparisons on a face with no sun exposure.",
    "    float projectedAreaScale = length(dx.xy) * length(dy.xy);",
    "    if(abs(determinant) <= max(0.00000000000000000001, projectedAreaScale * 0.001)){ return 1.0; }",
    "    vec2 planeGradient = vec2(0.0);",
    "    if(abs(determinant) > 0.00000000000000000001){",
    "        planeGradient = vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / determinant;",
    "    }",
    "    if(coord.w <= 0.0 || any(lessThan(uvz, vec3(0.0))) || any(greaterThan(uvz, vec3(1.0)))){ return 1.0; }",
    "    vec2 texel = max(starMadeShadowTexelSize, vec2(0.0000001));",
    "    // A tent footprint may cross a geometric crease. Its outer sample",
    "    // centers are at most two texels away on either axis; bound the plane",
    "    // extrapolation over that footprint rather than only raster rounding.",
    "    uvz.z -= dot(abs(planeGradient), texel) * 2.0;",
    "    vec2 pixel = uvz.xy / texel - 0.5;",
    "    vec2 base = (floor(pixel) + 0.5) * texel;",
    "    vec2 fraction = fract(pixel);",
    "    // Separable tent PCF: integrate depth comparisons, never raw depth.",
    "    // Four taps per axis cover a continuous two-texel filter radius.",
    "    float visibility = 0.0;",
    "    for(int y = -1; y <= 2; y++){",
    "        for(int x = -1; x <= 2; x++){",
    "            vec2 offset = vec2(float(x), float(y));",
    "            vec2 weight = max(vec2(0.0), vec2(1.0) - abs(offset - fraction) * 0.5);",
    "            vec2 uv = base + offset * texel;",
    "            visibility += weight.x * weight.y * starMadeShadowCompare(index, uv, uvz.z + dot(planeGradient, uv - uvz.xy));",
    "        }",
    "    }",
    "    return visibility * 0.25;",
    "}",
    "vec3 starMadeShadowColorForIndex(int index){",
    "	if(index <= 0){ return starMadeShadowColor0; }",
    "	if(index == 1){ return starMadeShadowColor1; }",
    "	return starMadeShadowColor2;",
    "}",
    "vec3 starMadeBlockSourceShadowVisibility(){",
    "	int splitCount = starMadeShadowSplitCount();",
    "	vec3 weightedVisibility = vec3(0.0);",
    "	vec3 totalColor = vec3(0.0);",
    "	vec3 color0 = starMadeShadowColorForIndex(0);",
    "	weightedVisibility += color0 * shad(0);",
    "	totalColor += color0;",
    "	if(splitCount > 1){",
    "		vec3 color1 = starMadeShadowColorForIndex(1);",
    "		weightedVisibility += color1 * shad(1);",
    "		totalColor += color1;",
    "	}",
    "	if(splitCount > 2){",
    "		vec3 color2 = starMadeShadowColorForIndex(2);",
    "		weightedVisibility += color2 * shad(2);",
    "		totalColor += color2;",
    "	}",
    "	vec3 visibility = vec3(1.0);",
    "	if(totalColor.r > 0.0001){ visibility.r = weightedVisibility.r / totalColor.r; }",
    "	if(totalColor.g > 0.0001){ visibility.g = weightedVisibility.g / totalColor.g; }",
    "	if(totalColor.b > 0.0001){ visibility.b = weightedVisibility.b / totalColor.b; }",
    "	return mix(vec3(1.0), visibility, starMadeShadowStrength);",
    "}",
    "float shadowCoef();",
    "vec3 starMadeShadowVisibility(){",
    "	if(starMadeShadowStrength <= 0.0){ return vec3(1.0); }",
    "	if(starMadeShadowMapArrayMode == 1){",
    "		return starMadeBlockSourceShadowVisibility();",
    "	}",
    "	return vec3(shadowCoef());",
    "}",
    "float shadowCoef(){",
    "	if(starMadeShadowStrength <= 0.0){ return 1.0; }",
    "	if(starMadeShadowMapArrayMode == 1){",
    "		int splitCount = starMadeShadowSplitCount();",
    "		float visibility = shad(0);",
    "		if(splitCount > 1){ visibility += shad(1); }",
    "		if(splitCount > 2){ visibility += shad(2); }",
    "		visibility /= float(splitCount);",
    "		return mix(1.0, visibility, starMadeShadowStrength);",
    "	}",
    "	if(starMadeShadowSplitCount() == 1){ return mix(1.0, shad(0), starMadeShadowStrength); }",
    "	float depth = gl_FragCoord.z;",
    "	int splits = starMadeShadowSplitCount();",
    "	float shadowDepthLimit = splits > 1 ? starMadeShadowFarDistances.z : 0.9983;",
    "	float visibility = 1.0;",
    "	if(splits > 2 && depth > starMadeShadowFarDistances.y - starMadeShadowSeam && depth < starMadeShadowFarDistances.y + starMadeShadowSeam){",
    "		visibility = mix(shad(2), shad(1), ((starMadeShadowFarDistances.y - depth) + starMadeShadowSeam) * starMadeShadowSeamMult);",
    "	}else if(splits > 1 && depth > starMadeShadowFarDistances.x - starMadeShadowSeam && depth < starMadeShadowFarDistances.x + starMadeShadowSeam){",
    "		visibility = mix(shad(1), shad(0), ((starMadeShadowFarDistances.x - depth) + starMadeShadowSeam) * starMadeShadowSeamMult);",
    "	}else{",
    "		int index = splits - 1;",
    "		if(depth < starMadeShadowFarDistances.x){ index = 0; }",
    "		else if(depth < starMadeShadowFarDistances.y){ index = starMadeShadowMinI(1, index); }",
    "		else if(depth < starMadeShadowFarDistances.z){ index = starMadeShadowMinI(2, index); }",
    "		else if(depth < shadowDepthLimit){ index = starMadeShadowMinI(2, index); }",
    "		else{ visibility = 1.0; }",
    "		if(depth < shadowDepthLimit){ visibility = shad(index); }",
    "	}",
    "	return mix(1.0, visibility, starMadeShadowStrength);",
    "}",
    "vec3 starMadeCubeShadowVisibility(vec4 starMadeOcclusion){",
    "\tif(starMadeShadowStrength <= 0.0){ return vec3(1.0); }",
    "	vec3 starMadeShadowOcclusion = vec3(starMadeOcclusion.w) * (1.0 - starMadeShadowVisibility());",
    "	return min(vec3(1.0), ((vec3(1.0) - starMadeShadowOcclusion) + vec3(0.17))) * 1.2;",
    "}",
    ""
  ].join("\n");
}

export function injectStarMadeShadowFragment(fragmentShader: string): string {
  const header = starMadeShadowFragmentHeader();

  if (!fragmentShader.includes("starMadeFragColor = lightedColor;")) {
    throw new Error("StarMade cube fragment shader does not expose lightedColor assignment for LOD shadow injection");
  }

  return (
    header +
    fragmentShader.replace(
      "starMadeFragColor = lightedColor;",
      "starMadeFragColor = lightedColor;\n\tstarMadeFragColor.rgb *= starMadeCubeShadowVisibility(occlusion);"
    )
  );
}

export function injectStarMadeLodShadowFragment(fragmentShader: string): string {
  if (!fragmentShader.includes("float totOcc =")) {
    throw new Error("StarMade LOD fragment shader does not expose totOcc for shadow injection");
  }

  if (!fragmentShader.includes("starMadeFragColor.a = tex.a;")) {
    throw new Error("StarMade LOD fragment shader does not expose alpha assignment for shadow injection");
  }

  return (
    starMadeShadowFragmentHeader() +
    fragmentShader.replace(
      "starMadeFragColor.a = tex.a;",
      [
        "starMadeFragColor.a = tex.a;",
        "	starMadeFragColor.rgb *= starMadeCubeShadowVisibility(vec4(0.0, 0.0, 0.0, totOcc));"
      ].join("\n")
    )
  );
}
