CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Base32 Crockford encoder
CREATE OR REPLACE FUNCTION encode_base32_ulid(input BYTEA)
RETURNS TEXT AS $$
DECLARE
    alphabet TEXT := '0123456789abcdefghjkmnpqrstvwxyz';
    output TEXT := '';
    buffer BIGINT := 0;
    bits INT := 0;
    i INT;
    byte INT;
    idx INT;
BEGIN
    IF input IS NULL THEN
        RETURN NULL;
    END IF;

    FOR i IN 0..length(input)-1 LOOP
        byte := get_byte(input, i);
        buffer := (buffer << 8) | byte;
        bits := bits + 8;

        WHILE bits >= 5 LOOP
            bits := bits - 5;
            idx := ((buffer >> bits) & 31)::INT + 1;
            output := output || substr(alphabet, idx, 1);
        END LOOP;
    END LOOP;

    IF bits > 0 THEN
        idx := ((buffer << (5 - bits)) & 31)::INT + 1;
        output := output || substr(alphabet, idx, 1);
    END IF;

    RETURN output;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- ULID generator (no prefix)
CREATE OR REPLACE FUNCTION generate_ulid()
RETURNS TEXT AS $$
DECLARE
    ts_bytes BYTEA;
    rand_bytes BYTEA;
BEGIN
    ts_bytes := decode(
        lpad(to_hex((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint), 12, '0'),
        'hex'
    );
    rand_bytes := gen_random_bytes(10);
    RETURN substr(encode_base32_ulid(ts_bytes || rand_bytes), 1, 26);
END;
$$ LANGUAGE plpgsql VOLATILE;
