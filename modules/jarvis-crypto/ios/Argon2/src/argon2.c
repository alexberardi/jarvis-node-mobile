/*
 * Argon2 reference implementation - consolidated single file
 * Public domain (CC0) - https://github.com/P-H-C/phc-winner-argon2
 *
 * This is a minimal implementation for argon2id only.
 * Compiled with -DARGON2_NO_THREADS for single-threaded use.
 */

#include "../include/argon2.h"
#include <stdlib.h>
#include <string.h>

/* ============== BLAKE2B ============== */

#define BLAKE2B_BLOCKBYTES 128
#define BLAKE2B_OUTBYTES 64
#define BLAKE2B_KEYBYTES 64

typedef struct {
    uint64_t h[8];
    uint64_t t[2];
    uint64_t f[2];
    uint8_t buf[BLAKE2B_BLOCKBYTES];
    size_t buflen;
    size_t outlen;
} blake2b_state;

static const uint64_t blake2b_IV[8] = {
    0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL,
    0x3c6ef372fe94f82bULL, 0xa54ff53a5f1d36f1ULL,
    0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL,
    0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL
};

static const uint8_t blake2b_sigma[12][16] = {
    {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15},
    {14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3},
    {11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4},
    {7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8},
    {9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13},
    {2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9},
    {12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11},
    {13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10},
    {6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5},
    {10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0},
    {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15},
    {14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3}
};

static inline uint64_t rotr64(uint64_t x, unsigned n) {
    return (x >> n) | (x << (64 - n));
}

static inline uint64_t load64(const void *src) {
    const uint8_t *p = (const uint8_t *)src;
    return ((uint64_t)p[0]) | ((uint64_t)p[1] << 8) |
           ((uint64_t)p[2] << 16) | ((uint64_t)p[3] << 24) |
           ((uint64_t)p[4] << 32) | ((uint64_t)p[5] << 40) |
           ((uint64_t)p[6] << 48) | ((uint64_t)p[7] << 56);
}

static inline void store32(void *dst, uint32_t w) {
    uint8_t *p = (uint8_t *)dst;
    p[0] = (uint8_t)(w);
    p[1] = (uint8_t)(w >> 8);
    p[2] = (uint8_t)(w >> 16);
    p[3] = (uint8_t)(w >> 24);
}

static inline void store64(void *dst, uint64_t w) {
    uint8_t *p = (uint8_t *)dst;
    p[0] = (uint8_t)(w);
    p[1] = (uint8_t)(w >> 8);
    p[2] = (uint8_t)(w >> 16);
    p[3] = (uint8_t)(w >> 24);
    p[4] = (uint8_t)(w >> 32);
    p[5] = (uint8_t)(w >> 40);
    p[6] = (uint8_t)(w >> 48);
    p[7] = (uint8_t)(w >> 56);
}

#define G(r, i, a, b, c, d)                     \
    do {                                        \
        a = a + b + m[blake2b_sigma[r][2*i+0]]; \
        d = rotr64(d ^ a, 32);                  \
        c = c + d;                              \
        b = rotr64(b ^ c, 24);                  \
        a = a + b + m[blake2b_sigma[r][2*i+1]]; \
        d = rotr64(d ^ a, 16);                  \
        c = c + d;                              \
        b = rotr64(b ^ c, 63);                  \
    } while (0)

#define ROUND(r)                    \
    do {                            \
        G(r, 0, v[0], v[4], v[8], v[12]); \
        G(r, 1, v[1], v[5], v[9], v[13]); \
        G(r, 2, v[2], v[6], v[10], v[14]); \
        G(r, 3, v[3], v[7], v[11], v[15]); \
        G(r, 4, v[0], v[5], v[10], v[15]); \
        G(r, 5, v[1], v[6], v[11], v[12]); \
        G(r, 6, v[2], v[7], v[8], v[13]); \
        G(r, 7, v[3], v[4], v[9], v[14]); \
    } while (0)

static void blake2b_compress(blake2b_state *S, const uint8_t block[BLAKE2B_BLOCKBYTES]) {
    uint64_t m[16];
    uint64_t v[16];

    for (size_t i = 0; i < 16; ++i)
        m[i] = load64(block + i * 8);

    for (size_t i = 0; i < 8; ++i)
        v[i] = S->h[i];

    v[8] = blake2b_IV[0];
    v[9] = blake2b_IV[1];
    v[10] = blake2b_IV[2];
    v[11] = blake2b_IV[3];
    v[12] = blake2b_IV[4] ^ S->t[0];
    v[13] = blake2b_IV[5] ^ S->t[1];
    v[14] = blake2b_IV[6] ^ S->f[0];
    v[15] = blake2b_IV[7] ^ S->f[1];

    ROUND(0);
    ROUND(1);
    ROUND(2);
    ROUND(3);
    ROUND(4);
    ROUND(5);
    ROUND(6);
    ROUND(7);
    ROUND(8);
    ROUND(9);
    ROUND(10);
    ROUND(11);

    for (size_t i = 0; i < 8; ++i)
        S->h[i] = S->h[i] ^ v[i] ^ v[i + 8];
}

static void blake2b_init(blake2b_state *S, size_t outlen) {
    memset(S, 0, sizeof(*S));
    for (size_t i = 0; i < 8; ++i)
        S->h[i] = blake2b_IV[i];
    S->h[0] ^= 0x01010000 ^ outlen;
    S->outlen = outlen;
}

static void blake2b_update(blake2b_state *S, const void *in, size_t inlen) {
    const uint8_t *pin = (const uint8_t *)in;

    if (inlen == 0) return;

    size_t left = S->buflen;
    size_t fill = BLAKE2B_BLOCKBYTES - left;

    if (inlen > fill) {
        S->buflen = 0;
        memcpy(S->buf + left, pin, fill);
        S->t[0] += BLAKE2B_BLOCKBYTES;
        if (S->t[0] < BLAKE2B_BLOCKBYTES) S->t[1]++;
        blake2b_compress(S, S->buf);
        pin += fill;
        inlen -= fill;

        while (inlen > BLAKE2B_BLOCKBYTES) {
            S->t[0] += BLAKE2B_BLOCKBYTES;
            if (S->t[0] < BLAKE2B_BLOCKBYTES) S->t[1]++;
            blake2b_compress(S, pin);
            pin += BLAKE2B_BLOCKBYTES;
            inlen -= BLAKE2B_BLOCKBYTES;
        }
    }
    memcpy(S->buf + S->buflen, pin, inlen);
    S->buflen += inlen;
}

static void blake2b_final(blake2b_state *S, void *out) {
    S->t[0] += S->buflen;
    if (S->t[0] < S->buflen) S->t[1]++;
    S->f[0] = (uint64_t)-1;
    memset(S->buf + S->buflen, 0, BLAKE2B_BLOCKBYTES - S->buflen);
    blake2b_compress(S, S->buf);

    uint8_t buffer[BLAKE2B_OUTBYTES];
    for (size_t i = 0; i < 8; ++i)
        store64(buffer + i * 8, S->h[i]);
    memcpy(out, buffer, S->outlen);
}

static void blake2b_long(void *out, size_t outlen, const void *in, size_t inlen) {
    uint8_t outlen_bytes[4];
    store32(outlen_bytes, (uint32_t)outlen);

    if (outlen <= BLAKE2B_OUTBYTES) {
        blake2b_state S;
        blake2b_init(&S, outlen);
        blake2b_update(&S, outlen_bytes, 4);
        blake2b_update(&S, in, inlen);
        blake2b_final(&S, out);
    } else {
        uint8_t out_buffer[BLAKE2B_OUTBYTES];
        blake2b_state S;
        blake2b_init(&S, BLAKE2B_OUTBYTES);
        blake2b_update(&S, outlen_bytes, 4);
        blake2b_update(&S, in, inlen);
        blake2b_final(&S, out_buffer);

        memcpy(out, out_buffer, BLAKE2B_OUTBYTES / 2);
        out = (uint8_t *)out + BLAKE2B_OUTBYTES / 2;
        size_t remaining = outlen - BLAKE2B_OUTBYTES / 2;

        while (remaining > BLAKE2B_OUTBYTES) {
            blake2b_init(&S, BLAKE2B_OUTBYTES);
            blake2b_update(&S, out_buffer, BLAKE2B_OUTBYTES);
            blake2b_final(&S, out_buffer);
            memcpy(out, out_buffer, BLAKE2B_OUTBYTES / 2);
            out = (uint8_t *)out + BLAKE2B_OUTBYTES / 2;
            remaining -= BLAKE2B_OUTBYTES / 2;
        }

        blake2b_init(&S, remaining);
        blake2b_update(&S, out_buffer, BLAKE2B_OUTBYTES);
        blake2b_final(&S, out);
    }
}

/* ============== ARGON2 CORE ============== */

#define ARGON2_BLOCK_SIZE 1024
#define ARGON2_QWORDS_IN_BLOCK (ARGON2_BLOCK_SIZE / 8)
#define ARGON2_SYNC_POINTS 4

typedef struct block_ {
    uint64_t v[ARGON2_QWORDS_IN_BLOCK];
} block;

typedef struct Argon2_instance_t {
    block *memory;
    uint32_t passes;
    uint32_t memory_blocks;
    uint32_t segment_length;
    uint32_t lane_length;
    uint32_t lanes;
    argon2_type type;
    uint32_t version;
} argon2_instance_t;

typedef struct Argon2_position_t {
    uint32_t pass;
    uint32_t lane;
    uint32_t slice;
    uint32_t index;
} argon2_position_t;

static void copy_block(block *dst, const block *src) {
    memcpy(dst->v, src->v, sizeof(dst->v));
}

static void xor_block(block *dst, const block *src) {
    for (size_t i = 0; i < ARGON2_QWORDS_IN_BLOCK; ++i)
        dst->v[i] ^= src->v[i];
}

#define R(a, b, c, d)                           \
    do {                                        \
        a = a + b + 2 * (uint32_t)(a) * (uint32_t)(b); \
        d = rotr64(d ^ a, 32);                  \
        c = c + d + 2 * (uint32_t)(c) * (uint32_t)(d); \
        b = rotr64(b ^ c, 24);                  \
        a = a + b + 2 * (uint32_t)(a) * (uint32_t)(b); \
        d = rotr64(d ^ a, 16);                  \
        c = c + d + 2 * (uint32_t)(c) * (uint32_t)(d); \
        b = rotr64(b ^ c, 63);                  \
    } while (0)

static void fill_block(const block *prev, const block *ref, block *next, int with_xor) {
    block blockR, blockTmp;
    copy_block(&blockR, ref);
    xor_block(&blockR, prev);
    copy_block(&blockTmp, &blockR);

    for (size_t i = 0; i < 8; ++i) {
        uint64_t *v = blockR.v + 16 * i;
        R(v[0], v[4], v[8], v[12]);
        R(v[1], v[5], v[9], v[13]);
        R(v[2], v[6], v[10], v[14]);
        R(v[3], v[7], v[11], v[15]);
        R(v[0], v[5], v[10], v[15]);
        R(v[1], v[6], v[11], v[12]);
        R(v[2], v[7], v[8], v[13]);
        R(v[3], v[4], v[9], v[14]);
    }

    for (size_t i = 0; i < 8; ++i) {
        uint64_t *v = blockR.v + 2 * i;
        R(v[0], v[16], v[32], v[48]);
        R(v[1], v[17], v[33], v[49]);
        R(v[64], v[80], v[96], v[112]);
        R(v[65], v[81], v[97], v[113]);
        R(v[0], v[17], v[32], v[113]);
        R(v[1], v[16], v[33], v[112]);
        R(v[64], v[81], v[96], v[49]);
        R(v[65], v[80], v[97], v[48]);
    }

    copy_block(next, &blockTmp);
    xor_block(next, &blockR);
    if (with_xor) {
        xor_block(next, prev);
    }
}

static uint32_t index_alpha(const argon2_instance_t *instance, const argon2_position_t *position,
                            uint32_t pseudo_rand, int same_lane) {
    uint32_t reference_area_size;
    uint32_t relative_position;

    if (position->pass == 0) {
        if (position->slice == 0) {
            reference_area_size = position->index - 1;
        } else {
            if (same_lane) {
                reference_area_size = position->slice * instance->segment_length + position->index - 1;
            } else {
                reference_area_size = position->slice * instance->segment_length +
                                     ((position->index == 0) ? -1 : 0);
            }
        }
    } else {
        if (same_lane) {
            reference_area_size = instance->lane_length - instance->segment_length + position->index - 1;
        } else {
            reference_area_size = instance->lane_length - instance->segment_length +
                                 ((position->index == 0) ? -1 : 0);
        }
    }

    uint64_t relative_position64 = pseudo_rand;
    relative_position64 = (relative_position64 * relative_position64) >> 32;
    relative_position64 = reference_area_size - 1 -
                         ((reference_area_size * relative_position64) >> 32);
    relative_position = (uint32_t)relative_position64;

    uint32_t start_position = 0;
    if (position->pass != 0) {
        start_position = (position->slice == ARGON2_SYNC_POINTS - 1) ? 0 :
                        (position->slice + 1) * instance->segment_length;
    }

    return (start_position + relative_position) % instance->lane_length;
}

static void fill_segment(const argon2_instance_t *instance, argon2_position_t position) {
    block *ref_block = NULL, *curr_block = NULL;
    block address_block, input_block, zero_block;
    int data_independent = (instance->type == Argon2_i) ||
                          (instance->type == Argon2_id && position.pass == 0 && position.slice < ARGON2_SYNC_POINTS / 2);

    if (data_independent) {
        memset(zero_block.v, 0, sizeof(zero_block.v));
        memset(input_block.v, 0, sizeof(input_block.v));
        input_block.v[0] = position.pass;
        input_block.v[1] = position.lane;
        input_block.v[2] = position.slice;
        input_block.v[3] = instance->memory_blocks;
        input_block.v[4] = instance->passes;
        input_block.v[5] = instance->type;
    }

    uint32_t starting_index = 0;
    if (position.pass == 0 && position.slice == 0) {
        starting_index = 2;
        if (data_independent) {
            input_block.v[6]++;
            fill_block(&zero_block, &input_block, &address_block, 0);
            fill_block(&zero_block, &address_block, &address_block, 0);
        }
    }

    uint32_t curr_offset = position.lane * instance->lane_length +
                          position.slice * instance->segment_length + starting_index;
    uint32_t prev_offset = curr_offset - 1;
    if (curr_offset % instance->lane_length == 0) {
        prev_offset += instance->lane_length;
    }

    for (uint32_t i = starting_index; i < instance->segment_length; ++i, ++curr_offset, ++prev_offset) {
        if (curr_offset % instance->lane_length == 1) {
            prev_offset = curr_offset - 1;
        }

        uint64_t pseudo_rand;
        if (data_independent) {
            if (i % ARGON2_QWORDS_IN_BLOCK == 0) {
                input_block.v[6]++;
                fill_block(&zero_block, &input_block, &address_block, 0);
                fill_block(&zero_block, &address_block, &address_block, 0);
            }
            pseudo_rand = address_block.v[i % ARGON2_QWORDS_IN_BLOCK];
        } else {
            pseudo_rand = instance->memory[prev_offset].v[0];
        }

        uint32_t ref_lane = ((uint32_t)(pseudo_rand >> 32)) % instance->lanes;
        if (position.pass == 0 && position.slice == 0) {
            ref_lane = position.lane;
        }

        position.index = i;
        uint32_t ref_index = index_alpha(instance, &position, (uint32_t)pseudo_rand, ref_lane == position.lane);
        uint32_t ref_offset = ref_lane * instance->lane_length + ref_index;

        ref_block = instance->memory + ref_offset;
        curr_block = instance->memory + curr_offset;
        int with_xor = (position.pass != 0);
        fill_block(instance->memory + prev_offset, ref_block, curr_block, with_xor);
    }
}

static int initialize(argon2_instance_t *instance, const void *pwd, size_t pwdlen,
                      const void *salt, size_t saltlen) {
    uint8_t blockhash[BLAKE2B_OUTBYTES];
    uint8_t value[4];

    blake2b_state BlakeHash;
    blake2b_init(&BlakeHash, BLAKE2B_OUTBYTES);

    store32(value, instance->lanes);
    blake2b_update(&BlakeHash, value, 4);
    store32(value, 32);  // hashlen
    blake2b_update(&BlakeHash, value, 4);
    store32(value, instance->memory_blocks);
    blake2b_update(&BlakeHash, value, 4);
    store32(value, instance->passes);
    blake2b_update(&BlakeHash, value, 4);
    store32(value, instance->version);
    blake2b_update(&BlakeHash, value, 4);
    store32(value, instance->type);
    blake2b_update(&BlakeHash, value, 4);
    store32(value, (uint32_t)pwdlen);
    blake2b_update(&BlakeHash, value, 4);
    blake2b_update(&BlakeHash, pwd, pwdlen);
    store32(value, (uint32_t)saltlen);
    blake2b_update(&BlakeHash, value, 4);
    blake2b_update(&BlakeHash, salt, saltlen);
    store32(value, 0);  // secretlen
    blake2b_update(&BlakeHash, value, 4);
    store32(value, 0);  // adlen
    blake2b_update(&BlakeHash, value, 4);

    blake2b_final(&BlakeHash, blockhash);

    uint8_t blockhash_bytes[ARGON2_BLOCK_SIZE];
    for (uint32_t l = 0; l < instance->lanes; ++l) {
        store32(blockhash + BLAKE2B_OUTBYTES, 0);
        store32(blockhash + BLAKE2B_OUTBYTES + 4, l);
        blake2b_long(blockhash_bytes, ARGON2_BLOCK_SIZE, blockhash, BLAKE2B_OUTBYTES + 8);
        memcpy(instance->memory[l * instance->lane_length].v, blockhash_bytes, ARGON2_BLOCK_SIZE);

        store32(blockhash + BLAKE2B_OUTBYTES, 1);
        blake2b_long(blockhash_bytes, ARGON2_BLOCK_SIZE, blockhash, BLAKE2B_OUTBYTES + 8);
        memcpy(instance->memory[l * instance->lane_length + 1].v, blockhash_bytes, ARGON2_BLOCK_SIZE);
    }

    memset(blockhash, 0, sizeof(blockhash));
    return ARGON2_OK;
}

static void finalize(const argon2_instance_t *instance, void *out, size_t outlen) {
    block blockhash;
    copy_block(&blockhash, instance->memory + instance->lane_length - 1);

    for (uint32_t l = 1; l < instance->lanes; ++l) {
        xor_block(&blockhash, instance->memory + l * instance->lane_length + instance->lane_length - 1);
    }

    blake2b_long(out, outlen, blockhash.v, ARGON2_BLOCK_SIZE);
    memset(blockhash.v, 0, sizeof(blockhash.v));
}

/* ============== ARGON2ID API ============== */

int argon2id_hash_raw(const uint32_t t_cost, const uint32_t m_cost,
                      const uint32_t parallelism, const void *pwd,
                      const size_t pwdlen, const void *salt,
                      const size_t saltlen, void *hash,
                      const size_t hashlen) {
    if (hash == NULL) return ARGON2_OUTPUT_PTR_NULL;
    if (hashlen < 4) return ARGON2_OUTPUT_TOO_SHORT;
    if (saltlen < 8) return ARGON2_SALT_TOO_SHORT;
    if (t_cost < 1) return ARGON2_TIME_TOO_SMALL;
    if (m_cost < 8 * parallelism) return ARGON2_MEMORY_TOO_LITTLE;
    if (parallelism < 1) return ARGON2_LANES_TOO_FEW;

    uint32_t memory_blocks = m_cost;
    if (memory_blocks < 2 * ARGON2_SYNC_POINTS * parallelism) {
        memory_blocks = 2 * ARGON2_SYNC_POINTS * parallelism;
    }
    uint32_t segment_length = memory_blocks / (parallelism * ARGON2_SYNC_POINTS);
    memory_blocks = segment_length * parallelism * ARGON2_SYNC_POINTS;

    argon2_instance_t instance;
    instance.memory = NULL;
    instance.passes = t_cost;
    instance.memory_blocks = memory_blocks;
    instance.segment_length = segment_length;
    instance.lane_length = segment_length * ARGON2_SYNC_POINTS;
    instance.lanes = parallelism;
    instance.type = Argon2_id;
    instance.version = ARGON2_VERSION_NUMBER;

    instance.memory = (block *)calloc(memory_blocks, sizeof(block));
    if (instance.memory == NULL) {
        return ARGON2_MEMORY_ALLOCATION_ERROR;
    }

    int result = initialize(&instance, pwd, pwdlen, salt, saltlen);
    if (result != ARGON2_OK) {
        free(instance.memory);
        return result;
    }

    for (uint32_t pass = 0; pass < instance.passes; ++pass) {
        for (uint32_t slice = 0; slice < ARGON2_SYNC_POINTS; ++slice) {
            for (uint32_t lane = 0; lane < instance.lanes; ++lane) {
                argon2_position_t position = {pass, lane, slice, 0};
                fill_segment(&instance, position);
            }
        }
    }

    finalize(&instance, hash, hashlen);

    memset(instance.memory, 0, memory_blocks * sizeof(block));
    free(instance.memory);

    return ARGON2_OK;
}
