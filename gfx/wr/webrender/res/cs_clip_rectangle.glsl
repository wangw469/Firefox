/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include shared,clip_shared,ellipse

varying highp vec4 vLocalPos;
#ifdef WR_FEATURE_FAST_PATH
flat varying highp vec4 v_clip_radii;
flat varying highp vec2 v_clip_size;
#else
flat varying highp vec4 vClipCenter_Radius_TL;
flat varying highp vec4 vClipCenter_Radius_TR;
flat varying highp vec4 vClipCenter_Radius_BL;
flat varying highp vec4 vClipCenter_Radius_BR;
flat varying highp vec3 vClipPlane_TL;
flat varying highp vec3 vClipPlane_TR;
flat varying highp vec3 vClipPlane_BL;
flat varying highp vec3 vClipPlane_BR;
#endif
// Clip mode. Packed in to a vector to work around bug 1630356.
flat varying mediump vec2 vClipMode;

#ifdef WR_VERTEX_SHADER

PER_INSTANCE in vec2 aClipLocalPos;
PER_INSTANCE in vec4 aClipLocalRect;
PER_INSTANCE in float aClipMode;
PER_INSTANCE in vec4 aClipRect_TL;
PER_INSTANCE in vec4 aClipRadii_TL;
PER_INSTANCE in vec4 aClipRect_TR;
PER_INSTANCE in vec4 aClipRadii_TR;
PER_INSTANCE in vec4 aClipRect_BL;
PER_INSTANCE in vec4 aClipRadii_BL;
PER_INSTANCE in vec4 aClipRect_BR;
PER_INSTANCE in vec4 aClipRadii_BR;

struct ClipMaskInstanceRect {
    ClipMaskInstanceCommon base;
    vec2 local_pos;
};

ClipMaskInstanceRect fetch_clip_item() {
    ClipMaskInstanceRect cmi;

    cmi.base = fetch_clip_item_common();
    cmi.local_pos = aClipLocalPos;

    return cmi;
}

struct ClipRect {
    RectWithEndpoint rect;
    float mode;
};

struct ClipCorner {
    RectWithEndpoint rect;
    vec4 outer_inner_radius;
};

struct ClipData {
    ClipRect rect;
    ClipCorner top_left;
    ClipCorner top_right;
    ClipCorner bottom_left;
    ClipCorner bottom_right;
};

ClipData fetch_clip() {
    ClipData clip;

    clip.rect = ClipRect(RectWithEndpoint(aClipLocalRect.xy, aClipLocalRect.zw), aClipMode);
    clip.top_left = ClipCorner(RectWithEndpoint(aClipRect_TL.xy, aClipRect_TL.zw), aClipRadii_TL);
    clip.top_right = ClipCorner(RectWithEndpoint(aClipRect_TR.xy, aClipRect_TR.zw), aClipRadii_TR);
    clip.bottom_left = ClipCorner(RectWithEndpoint(aClipRect_BL.xy, aClipRect_BL.zw), aClipRadii_BL);
    clip.bottom_right = ClipCorner(RectWithEndpoint(aClipRect_BR.xy, aClipRect_BR.zw), aClipRadii_BR);

    return clip;
}

void main(void) {
    ClipMaskInstanceRect cmi = fetch_clip_item();
    Transform clip_transform = fetch_transform(cmi.base.clip_transform_id);
    Transform prim_transform = fetch_transform(cmi.base.prim_transform_id);
    ClipData clip = fetch_clip();

    RectWithEndpoint local_rect = clip.rect.rect;
    vec2 diff = cmi.local_pos - local_rect.p0;
    local_rect.p0 = cmi.local_pos;
    local_rect.p1 += diff;

    ClipVertexInfo vi = write_clip_tile_vertex(
        local_rect,
        prim_transform,
        clip_transform,
        cmi.base.sub_rect,
        cmi.base.task_origin,
        cmi.base.screen_origin,
        cmi.base.device_pixel_scale
    );

    vClipMode.x = clip.rect.mode;
    vLocalPos = vi.local_pos;

#ifdef WR_FEATURE_FAST_PATH
    // If the radii are all uniform, we can use a much simpler 2d
    // signed distance function to get a rounded rect clip.
    vec2 half_size = 0.5 * rect_size(local_rect);
    vLocalPos.xy -= (half_size + cmi.local_pos) * vi.local_pos.w;
    v_clip_size = half_size;
    v_clip_radii = vec4(
      clip.bottom_right.outer_inner_radius.x,
      clip.top_right.outer_inner_radius.x,
      clip.bottom_left.outer_inner_radius.x,
      clip.top_left.outer_inner_radius.x
    );
#else
    RectWithEndpoint clip_rect = local_rect;

    vec2 r_tl = clip.top_left.outer_inner_radius.xy;
    vec2 r_tr = clip.top_right.outer_inner_radius.xy;
    vec2 r_br = clip.bottom_right.outer_inner_radius.xy;
    vec2 r_bl = clip.bottom_left.outer_inner_radius.xy;

    vClipCenter_Radius_TL = vec4(clip_rect.p0 + r_tl,
                                 inverse_radii_squared(r_tl));

    vClipCenter_Radius_TR = vec4(clip_rect.p1.x - r_tr.x,
                                 clip_rect.p0.y + r_tr.y,
                                 inverse_radii_squared(r_tr));

    vClipCenter_Radius_BR = vec4(clip_rect.p1 - r_br,
                                 inverse_radii_squared(r_br));

    vClipCenter_Radius_BL = vec4(clip_rect.p0.x + r_bl.x,
                                 clip_rect.p1.y - r_bl.y,
                                 inverse_radii_squared(r_bl));

    // We need to know the half-spaces of the corners separate from the center
    // and radius. We compute a point that falls on the diagonal (which is just
    // an inner vertex pushed out along one axis, but not on both) to get the
    // plane offset of the half-space. We also compute the direction vector of
    // the half-space, which is a perpendicular vertex (-y,x) of the vector of
    // the diagonal. We leave the scales of the vectors unchanged.
    vec2 n_tl = -r_tl.yx;
    vec2 n_tr = vec2(r_tr.y, -r_tr.x);
    vec2 n_br = r_br.yx;
    vec2 n_bl = vec2(-r_bl.y, r_bl.x);
    vClipPlane_TL = vec3(n_tl,
                         dot(n_tl, vec2(clip_rect.p0.x, clip_rect.p0.y + r_tl.y)));
    vClipPlane_TR = vec3(n_tr,
                         dot(n_tr, vec2(clip_rect.p1.x - r_tr.x, clip_rect.p0.y)));
    vClipPlane_BR = vec3(n_br,
                         dot(n_br, vec2(clip_rect.p1.x, clip_rect.p1.y - r_br.y)));
    vClipPlane_BL = vec3(n_bl,
                         dot(n_bl, vec2(clip_rect.p0.x + r_bl.x, clip_rect.p1.y)));
#endif
}
#endif

#ifdef WR_FRAGMENT_SHADER

#ifdef WR_FEATURE_FAST_PATH
// See https://www.shadertoy.com/view/4llXD7
// Notes:
//  * pos is centered in the origin (so 0,0 is the center of the box).
//  * The border radii must not be larger than half_box_size.
float sd_round_box(in vec2 pos, in vec2 half_box_size, in vec4 radii) {
    radii.xy = (pos.x > 0.0) ? radii.xy : radii.zw;
    radii.x  = (pos.y > 0.0) ? radii.x  : radii.y;
    vec2 q = abs(pos) - half_box_size + radii.x;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radii.x;
}
#endif

void main(void) {
    vec2 local_pos = vLocalPos.xy / vLocalPos.w;
    float aa_range = compute_aa_range(local_pos);

#ifdef WR_FEATURE_FAST_PATH
    float dist = sd_round_box(local_pos, v_clip_size, v_clip_radii);
#else
    float dist = distance_to_rounded_rect(
        local_pos,
        vClipPlane_TL,
        vClipCenter_Radius_TL,
        vClipPlane_TR,
        vClipCenter_Radius_TR,
        vClipPlane_BR,
        vClipCenter_Radius_BR,
        vClipPlane_BL,
        vClipCenter_Radius_BL,
        vTransformBounds
    );
#endif

    // Compute AA for the given dist and range.
    float alpha = distance_aa(aa_range, dist);

    // Select alpha or inverse alpha depending on clip in/out.
    float final_alpha = mix(alpha, 1.0 - alpha, vClipMode.x);

    float final_final_alpha = vLocalPos.w > 0.0 ? final_alpha : 0.0;
    oFragColor = vec4(final_final_alpha, 0.0, 0.0, 1.0);
}

#ifdef SWGL_DRAW_SPAN
// Currently the cs_clip_rectangle shader is slow because it always evaluates
// the corner ellipse segments and the rectangle AA for every fragment the
// shader is run on. To alleviate this for now with SWGL, this essentially
// implements a rounded-rectangle span rasterizer inside the span shader. The
// motivation is that we can separate out the parts of the span which are fully
// opaque and fully transparent, outputting runs of fixed color in those areas,
// while only evaluating the ellipse segments and AA in the smaller outlying
// parts of the span that actually need it.
// The shader conceptually represents a rounded rectangle as an inner octagon
// (8 half-spaces) bounding the opaque region and an outer octagon bounding the
// curve and AA parts. Everything outside is transparent. The line of the span
// is intersected with half-spaces, looking for interior spans that minimally
// intersect the half-spaces (start max, end min). In the ideal case we hit a
// start corner ellipse segment and an end corner ellipse segment, rendering
// the two curves on the ends with an opaque run in between, outputting clear
// for any transparent runs before and after the start and end curves.
// This is slightly complicated by the fact that the results here must agree
// with the main results of the fragment shader, in case SWGL has to fall back
// to the main fragment shader for any reason. So, we make an effort to handle
// both ways of operating - the uniform radius fast-path and the varying radius
// slow-path.
void swgl_drawSpanR8() {
    // Perspective is not supported.
    if (swgl_interpStep(vLocalPos).w != 0.0) {
        return;
    }

    // If the span is completely outside the Z-range and clipped out, just
    // output clear so we don't need to consider invalid W in the rest of the
    // shader.
    float w = swgl_forceScalar(vLocalPos.w);
    if (w <= 0.0) {
        swgl_commitSolidR8(0.0);
        return;
    }

    // To start, we evaluate the rounded-rectangle in local space relative to
    // the local-space position. This will be interpolated across the span to
    // track whether we intersect any half-spaces.
    w = 1.0 / w;
    vec2 local_pos = vLocalPos.xy * w;
    vec2 local_pos0 = swgl_forceScalar(local_pos);
    vec2 local_step = swgl_interpStep(vLocalPos).xy * w;
    float step_scale = max(dot(local_step, local_step), 1.0e-6);

    // Get the local-space AA range. This range represents 1/fwidth(local_pos),
    // essentially the scale of how much local-space maps to an AA pixel. We
    // need to know the inverse, how much local-space we traverse per AA pixel
    // pixel step. We then scale this to represent the amount of span steps
    // traversed per AA pixel step.
    float aa_range = compute_aa_range(local_pos);
    float aa_margin = inversesqrt(aa_range * aa_range * step_scale);

    // We need to know the bounds of the aligned rectangle portion of the rrect
    // in local-space. If we're using the fast-path, this is specified as the
    // half-width of the rrect in v_clip_size, which we map to the outer
    // bounding-box. For the general case, we have already stored the outer
    // bounding box in vTransformBounds.
    #ifdef WR_FEATURE_FAST_PATH
        vec4 clip_rect = vec4(-v_clip_size, v_clip_size);
    #else
        vec4 clip_rect = vTransformBounds;
    #endif

    // We need to compute the local-space distance to the bounding box and then
    // figure out how many processing steps that maps to. If we are stepping in
    // a negative direction on an axis, we need to swap the sides of the box
    // which we consider as the start or end. If there is no local-space step
    // on an axis (i.e. constant Y), we need to take care to force the steps to
    // either the start or end of the span depending on if we are inside or
    // outside of the bounding box.
    vec4 clip_dist =
        mix(clip_rect, clip_rect.zwxy, lessThan(local_step, vec2(0.0)).xyxy)
            - local_pos0.xyxy;
    clip_dist =
        mix(1.0e6 * step(0.0, clip_dist),
            clip_dist * recip(local_step).xyxy,
            notEqual(local_step, vec2(0.0)).xyxy);

    // Initially, the opaque region is bounded by the further start intersect
    // with the bounding box and the nearest end intersect with the bounding
    // box.
    float opaque_start = max(clip_dist.x, clip_dist.y);
    float opaque_end = min(clip_dist.z, clip_dist.w);
    float aa_start = opaque_start;
    float aa_end = opaque_end;

    // Here we actually intersect with the half-space of the corner. We get the
    // plane distance of the local-space position from the diagonal bounding
    // ellipse segment from the opaque region. The half-space is defined by the
    // direction vector of the plane and an offset point that falls on the
    // dividing line (which is a vertex on the corner box, which is actually on
    // the outer radius of the bounding box, but not a corner vertex). This
    // distance is positive if on the curve side and negative if on the inner
    // opaque region. If we are on the curve side, we need to verify we are
    // traveling in direction towards the opaque region so that we will
    // eventually intersect the diagonal so we can calculate when the start
    // corner segment will end, otherwise we are going away from the rrect.
    // If we are inside the opaque interior, we need to verify we are traveling
    // in direction towards the curve, so that we can calculate when the end
    // corner segment will start. Further, if we intersect, we calculate the
    // offset of the outer octagon where AA starts from the inner octagon of
    // where the opaque region starts using the apex vector (which is transpose
    // of the half-space's direction).
    //
    // We need to intersect the corner ellipse segments. Significantly, we need
    // to know where the apex of the ellipse segment is and how far to push the
    // outer diagonal of the octagon from the inner diagonal. The position of
    // the inner diagonal simply runs diagonal across the corner box and has a
    // constant offset from vertex on the inner bounding box. The apex also has
    // a constant offset along the opposite diagonal relative to the diagonal
    // intersect which is 1/sqrt(2) - 0.5 assuming unit length for the diagonal.
    // We then need to project the vector to the apex onto the local-space step
    // scale, but we do this with reference to the normal vector of the diagonal
    // using dot(normal, apex) / dot(normal, local_step), where the apex vector
    // is (0.7071 - 0.5) * abs(normal).yx * sign(normal).
    vec3 start_plane = vec3(1.0e6);
    vec3 end_plane = vec3(1.0e6);

    // plane is assumed to be a vec3 with normal in (X, Y) and offset in Z.
    #define CLIP_CORNER(plane, info) do {                                     \
        float dist = dot(local_pos0, plane.xy) - plane.z;                     \
        float scale = -dot(local_step, plane.xy);                             \
        if (scale >= 0.0) {                                                   \
            if (dist > opaque_start * scale) {                                \
                SET_CORNER(start_corner, info);                               \
                start_plane = plane;                                          \
                float inv_scale = recip(max(scale, 1.0e-6));                  \
                opaque_start = dist * inv_scale;                              \
                float apex = (0.7071 - 0.5) * 2.0 * abs(plane.x * plane.y);   \
                aa_start = opaque_start - apex * inv_scale;                   \
            }                                                                 \
        } else if (dist > opaque_end * scale) {                               \
            SET_CORNER(end_corner, info);                                     \
            end_plane = plane;                                                \
            float inv_scale = recip(min(scale, -1.0e-6));                     \
            opaque_end = dist * inv_scale;                                    \
            float apex = (0.7071 - 0.5) * 2.0 * abs(plane.x * plane.y);       \
            aa_end = opaque_end - apex * inv_scale;                           \
        }                                                                     \
    } while (false)

    #ifdef WR_FEATURE_FAST_PATH
        // For the fast-path, we only have the half-width of the outer bounding
        // box. We need to map this to points that fall on the diagonal of the
        // half-space for each corner. To do this we just need to push out the
        // vertex in the right direction on a single axis, leaving the other
        // unchanged.
        // However, since the corner radii are symmetric, and since the local
        // origin of each ellipse is assumed to be at (0, 0), the plane offset
        // of the half-space is similar for each case.
        // So for a given corner radii of z, given a corner offset (x, y - z)
        // and a vector of (z, z), the dot product becomes:
        //   x * z + (y-z)*z == x*z + y*z - z*z
        // The direction vector of the corner half-space has constant length,
        // but just needs an appropriate direction set.
        #define OFFSET_FOR(radii) \
          (v_clip_size.x + v_clip_size.y - radii) * radii
        vec3 plane_br = vec3(v_clip_radii.xx, OFFSET_FOR(v_clip_radii.x));
        vec3 plane_tr = vec3(v_clip_radii.y, -v_clip_radii.y, OFFSET_FOR(v_clip_radii.y));
        vec3 plane_bl = vec3(-v_clip_radii.z, v_clip_radii.z, OFFSET_FOR(v_clip_radii.z));
        vec3 plane_tl = vec3(-v_clip_radii.ww, OFFSET_FOR(v_clip_radii.w));

        #define SET_CORNER(corner, info)

        // Clip against the corner half-spaces.
        CLIP_CORNER(plane_tl, );
        CLIP_CORNER(plane_tr, );
        CLIP_CORNER(plane_br, );
        CLIP_CORNER(plane_bl, );

        // Later we need to calculate distance AA for both corners and the
        // outer bounding rect. For the fast-path, this is all done inside
        // sd_round_box.
        #define AA_RECT(local_pos) \
            sd_round_box(local_pos, v_clip_size, v_clip_radii)
    #else
        // For the general case, we need to remember which of the actual start
        // and end corners we intersect, so that we can evaluate the curve AA
        // against only those corners rather than having to try against all 4
        // corners for both sides of the span. Initialize these values so that
        // if no corner is intersected, they will just zero the AA.
        vec4 start_corner = vec4(vec2(1.0e6), vec2(1.0));
        vec4 end_corner = vec4(vec2(1.0e6), vec2(1.0));

        #define SET_CORNER(corner, info) corner = info

        // Clip against the corner half-spaces. We have already computed the
        // corner half-spaces in the vertex shader.
        CLIP_CORNER(vClipPlane_TL, vClipCenter_Radius_TL);
        CLIP_CORNER(vClipPlane_TR, vClipCenter_Radius_TR);
        CLIP_CORNER(vClipPlane_BR, vClipCenter_Radius_BR);
        CLIP_CORNER(vClipPlane_BL, vClipCenter_Radius_BL);

        // Later we need to calculate distance AA for both corners and the
        // outer bounding rect. For the general case, we need to explicitly
        // evaluate either the ellipse segment distance or the rect distance.
        #define AA_RECT(local_pos) \
            signed_distance_rect(local_pos, vTransformBounds.xy, vTransformBounds.zw)
        #define AA_CORNER(local_pos, corner) \
            distance_to_ellipse_approx(local_pos - corner.xy, corner.zw, 1.0)
    #endif

    // Pad the AA region by a margin, as the intersections take place assuming
    // pixel centers, but AA actually starts half a pixel away from the center.
    // If the AA region narrows to nothing, be careful not to inflate so much
    // that we start processing AA for fragments that don't need it.
    aa_margin = max(aa_margin - max(aa_start - aa_end, 0.0), 0.0);
    aa_start -= aa_margin;
    aa_end += aa_margin;

    // Compute the thresholds at which we need to transition between various
    // segments of the span, from fully transparent outside to the start of
    // the outer octagon where AA starts, from there to where the inner opaque
    // octagon starts, from there to where the opaque inner octagon ends and
    // AA starts again, to finally where the outer octagon/AA ends and we're
    // back to fully transparent. These thresholds are just flipped offsets
    // from the start of the span so we can compare against the remaining
    // span length which automatically deducts as we commit fragments.
    ivec4 steps = ivec4(clamp(
        swgl_SpanLength -
            swgl_StepSize *
                vec4(floor(aa_start), ceil(opaque_start), floor(opaque_end), ceil(aa_end)),
        0.0, swgl_SpanLength));
    int aa_start_len = steps.x;
    int opaque_start_len = steps.y;
    int opaque_end_len = steps.z;
    int aa_end_len = steps.w;

    // Output fully clear while we're outside the AA region.
    if (swgl_SpanLength > aa_start_len) {
        int num_aa = swgl_SpanLength - aa_start_len;
        swgl_commitPartialSolidR8(num_aa, vClipMode.x);
        local_pos += float(num_aa / swgl_StepSize) * local_step;
    }
    #ifdef AA_CORNER
    if (start_plane.x < 1.0e5) {
        // We're now in the outer octagon which requires AA. Evaluate the corner
        // distance of the start corner here and output AA for it. Before we hit
        // the actual opaque inner octagon, we have a transitional step where the
        // diagonal might intersect mid-way through the step. We have consider
        // either the corner or rect distance depending on which side we're on.
        while (swgl_SpanLength > opaque_start_len) {
            float alpha = distance_aa(aa_range,
                dot(local_pos, start_plane.xy) > start_plane.z
                    ? AA_CORNER(local_pos, start_corner)
                    : AA_RECT(local_pos));
            swgl_commitColorR8(mix(alpha, 1.0 - alpha, vClipMode.x));
            local_pos += local_step;
        }
    }
    #endif
    // If there's no start corner, just do rect AA until opaque.
    while (swgl_SpanLength > opaque_start_len) {
        float alpha = distance_aa(aa_range, AA_RECT(local_pos));
        swgl_commitColorR8(mix(alpha, 1.0 - alpha, vClipMode.x));
        local_pos += local_step;
    }
    // Now we're finally in the opaque inner octagon part of the span. Just
    // output a solid run.
    if (swgl_SpanLength > opaque_end_len) {
        int num_opaque = swgl_SpanLength - opaque_end_len;
        swgl_commitPartialSolidR8(num_opaque, 1.0 - vClipMode.x);
        local_pos += float(num_opaque / swgl_StepSize) * local_step;
    }
    #ifdef AA_CORNER
    if (end_plane.x < 1.0e5) {
        // Finally we're in the AA region on the other side, inside the outer
        // octagon again. Just evaluate the distance to the end corner and
        // compute AA for it. We're leaving the opaque inner octagon, but like
        // before, we have to be careful we're not dealing with a step partially
        // intersected by the end corner's diagonal. Check which side we are on
        // and use either the corner or rect distance as appropriate.
        while (swgl_SpanLength > aa_end_len) {
            float alpha = distance_aa(aa_range,
                dot(local_pos, end_plane.xy) > end_plane.z
                    ? AA_CORNER(local_pos, end_corner)
                    : AA_RECT(local_pos));
            swgl_commitColorR8(mix(alpha, 1.0 - alpha, vClipMode.x));
            local_pos += local_step;
        }
    }
    #endif
    // If there's no end corner, just do rect AA until clear.
    while (swgl_SpanLength > aa_end_len) {
        float alpha = distance_aa(aa_range, AA_RECT(local_pos));
        swgl_commitColorR8(mix(alpha, 1.0 - alpha, vClipMode.x));
        local_pos += local_step;
    }
    // We're now outside the outer AA octagon on the other side. Just output
    // fully clear.
    if (swgl_SpanLength > 0) {
        swgl_commitPartialSolidR8(swgl_SpanLength, vClipMode.x);
    }
}
#endif

#endif
