import React from "react";
import { Modal, Button, Row, Form } from "react-bootstrap";
import FormField from "../../../../components/FormFields/FormField";

const AddParticipantModal = ({
  show,
  onHide,
  handleSubmit,
  onSubmit,
  control,
  register,
  errors,
  touchedFields,
  fields = [],
  adding = false,
  reset,
}) => {
  return (
    <Modal
      show={show}
      onHide={() => {
        if (adding) return;
        onHide();
        reset({ user_id: null });
      }}
      centered
    >
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Participant</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row>
            {fields.map((field) => (
              <FormField
                key={field.name}
                field={field}
                control={control}
                register={register}
                errors={errors}
                touchedFields={touchedFields}
              />
            ))}
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => {
              if (adding) return;
              onHide();
              reset({ user_id: null });
            }}
            disabled={adding}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={adding}>
            {adding ? "Adding..." : "Add"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default AddParticipantModal;
